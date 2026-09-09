# Security

Do not post credentials or private source material in an issue. Report a security
problem privately to the repository owner, or use GitHub's private vulnerability
reporting feature when available.

The supported deployment uses the public POD projection, a dedicated read-only
application role and read-only artifact mounts. The PostgreSQL service and backend
are internal to the Compose network. Public hosting requires a separately
configured TLS reverse proxy.
