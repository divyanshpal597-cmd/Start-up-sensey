#!/bin/bash
# Double-click to start Laptop Remote on a Mac (or run ./start.sh on Linux).
# The first start installs what it needs.
cd "$(dirname "$0")" || exit 1

PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then
  echo "Python 3 is not installed. Install it from https://www.python.org/downloads/ and run this again."
  read -r -p "Press Enter to close."
  exit 1
fi

if [ ! -f .venv/ready ]; then
  echo "First start: setting up. This takes a minute..."
  "$PY" -m venv .venv || { echo "Could not create the setup folder. On Ubuntu/Debian run: sudo apt install python3-venv"; read -r -p "Press Enter to close."; exit 1; }
  .venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt || { echo "Setup failed. Check your internet connection."; read -r -p "Press Enter to close."; exit 1; }
  touch .venv/ready
fi
exec .venv/bin/python -m laptop_remote "$@"
