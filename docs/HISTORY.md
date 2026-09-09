# Historical releases

POD 1.6.0 and Navigator 1.0.0 reproduce the current corpus. Earlier POD versions
have their own databases, manifests, distribution files and renderer bindings.
The current database must never be relabeled as an earlier release.

The optional `compose.history.yaml` connects historical version routes for
1.5 through 1.5.6 to the live MODAVIS archival delivery service. It verifies the
upstream renderer's release and readiness at startup and preserves returned bytes.
The public-origin binding forwards the archival host name so the upstream TLS
reverse proxy selects the correct site. This mode requires network access and continued upstream availability. It is not
an offline backup of historical datasets.

```bash
docker compose -f compose.yaml -f compose.history.yaml up -d
```

For independent archival hosting, preserve the earlier datasets and their exact
renderer separately, then replace the fixed `baseUrl` and `rendererRelease`
bindings with that service. An unavailable or mismatched renderer fails explicitly;
Navigator never silently substitutes current graphs for historical ones.
