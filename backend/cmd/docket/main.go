// Command docket serves Docket: a self-hosted tracker for the work on many
// products, with a web app, a REST API and an MCP endpoint.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/netip"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata" // dates like "today" use TZ, even in a bare container

	"github.com/oddomens/docket/internal/server"
	"github.com/oddomens/docket/internal/store"
	"github.com/oddomens/docket/internal/webui"
)

var version = "dev"

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "healthcheck":
			os.Exit(healthcheck())
		case "reset-account":
			if err := resetAccount(env("DOCKET_DATA_DIR", "./data"), os.Stdout); err != nil {
				fmt.Fprintln(os.Stderr, "docket:", err)
				os.Exit(1)
			}
			return
		case "version", "--version":
			fmt.Println(version)
			return
		}
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "docket:", err)
		os.Exit(1)
	}
}

func run() error {
	level := slog.LevelInfo
	if strings.EqualFold(env("DOCKET_LOG_LEVEL", "info"), "debug") {
		level = slog.LevelDebug
	}
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))

	listen := env("DOCKET_LISTEN", "127.0.0.1:8200")
	dataDir := env("DOCKET_DATA_DIR", "./data")
	retention, err := strconv.Atoi(env("DOCKET_TRASH_DAYS", "30"))
	if err != nil || retention < 1 {
		return fmt.Errorf("DOCKET_TRASH_DAYS must be a whole number of days")
	}
	snapshots, err := strconv.Atoi(env("DOCKET_SNAPSHOTS", "7"))
	if err != nil || snapshots < 0 || snapshots > 365 {
		return fmt.Errorf("DOCKET_SNAPSHOTS must be a number of daily copies from 0 (off) to 365")
	}
	var proxies []netip.Prefix
	for _, c := range strings.FieldsFunc(os.Getenv("DOCKET_TRUSTED_PROXIES"), func(r rune) bool { return r == ',' || r == ' ' }) {
		p, err := netip.ParsePrefix(c)
		if err != nil {
			return fmt.Errorf("DOCKET_TRUSTED_PROXIES: %q isn't a CIDR range like 10.0.0.0/8", c)
		}
		proxies = append(proxies, p)
	}
	var hosts []string
	for _, h := range strings.FieldsFunc(os.Getenv("DOCKET_HOSTS"), func(r rune) bool { return r == ',' || r == ' ' }) {
		if strings.ContainsAny(h, "/:") {
			return fmt.Errorf("DOCKET_HOSTS: %q should be a name like docket.example.com, without a scheme or port", h)
		}
		hosts = append(hosts, h)
	}
	cfg := server.Config{
		Version:        version,
		TrustedProxies: proxies,
		Hosts:          hosts,
		TrashRetention: time.Duration(retention) * 24 * time.Hour,
		SnapshotDir:    filepath.Join(dataDir, "snapshots"),
		Snapshots:      snapshots,
	}

	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return err
	}
	// Hold the data folder for as long as the server runs, so reset-account
	// and a second server started by mistake can tell it's in use.
	release, err := lockDataDir(dataDir)
	switch {
	case errors.Is(err, errDataDirInUse):
		return fmt.Errorf("another Docket is already using the data folder %s", dataDir)
	case err != nil:
		log.Warn("can't lock the data folder; reset-account won't be able to tell that Docket is running", "err", err)
	default:
		defer release()
	}
	file := filepath.Join(dataDir, "docket.db")
	st, err := store.Open(file)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer st.Close()
	_ = os.Chmod(file, 0o600)
	if err := st.Check(); err != nil {
		log.Error("the database failed its integrity check; restore data/docket.db from a backup", "err", err)
	}

	srv := server.New(cfg, st, webui.FS(), log)

	// First run: create the account from DOCKET_PASSWORD if given, otherwise
	// print a one-time code for the setup screen.
	if made, err := srv.Bootstrap(env("DOCKET_NAME", "Owner"), os.Getenv("DOCKET_PASSWORD")); err != nil {
		return fmt.Errorf("create account: %w", err)
	} else if made {
		log.Info("account created from DOCKET_PASSWORD; you can remove it from the environment now")
	}
	if code, err := srv.SetupCode(); err != nil {
		return err
	} else if code != "" {
		log.Warn("Docket isn't set up yet. Open it in a browser and enter this setup code", "code", code)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go srv.Maintain(ctx)

	hs := &http.Server{
		Addr:              listen,
		Handler:           srv.Handler(),
		ReadTimeout:       time.Minute,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
	}
	errc := make(chan error, 1)
	go func() { errc <- hs.ListenAndServe() }()
	log.Info("docket listening", "addr", listen, "version", version)

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return hs.Shutdown(shutdown)
}

func healthcheck() int {
	addr := env("DOCKET_LISTEN", "127.0.0.1:8200")
	if strings.HasPrefix(addr, ":") {
		addr = "127.0.0.1" + addr
	}
	c := http.Client{Timeout: 3 * time.Second}
	res, err := c.Get("http://" + addr + "/api/health")
	if err != nil {
		return 1
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
