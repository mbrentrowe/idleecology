#!/usr/bin/env sh
set -eu

PORT="${1:-8080}"
exec perl dev_server.pl "$PORT"
