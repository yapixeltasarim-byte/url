#!/bin/sh
# Hostinger / paylasimli hosting durdurma scripti.
# nproc doluyken yeni `node` sureci acilamayabilir (EAGAIN); bu yuzden
# yalnizca kabuk builtins + kill kullanilir, Node calistirilmaz.

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PIDFILE="$ROOT/data/app.pid"
MARKER="$ROOT/src/index.js"

is_alive() {
  kill -0 "$1" 2>/dev/null
}

is_ours() {
  pid=$1
  if [ -r "/proc/$pid/cmdline" ]; then
    cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || return 1
    case $cmd in
      *"$MARKER"*) return 0 ;;
      *) return 1 ;;
    esac
  fi
  # /proc yoksa (yerel macOS) pid dosyasina guvenilir.
  return 0
}

stop_pid() {
  pid=$1
  if ! is_alive "$pid"; then
    echo "[stop] pid $pid zaten yok"
    return 0
  fi
  if ! is_ours "$pid"; then
    echo "[stop] pid $pid bu uygulamaya ait degil, dokunulmadi"
    return 1
  fi

  echo "[stop] SIGTERM -> $pid"
  kill -TERM "$pid" 2>/dev/null || true

  n=0
  while [ "$n" -lt 20 ]; do
    is_alive "$pid" || break
    sleep 1 2>/dev/null || break
    n=$((n + 1))
  done

  if is_alive "$pid"; then
    echo "[stop] SIGKILL -> $pid"
    kill -KILL "$pid" 2>/dev/null || true
  fi
  echo "[stop] durduruldu: $pid"
  return 0
}

PIDS=""

if [ -f "$PIDFILE" ]; then
  # Satir sonu olmasa da POSIX read EOF'da 1 doner; pid yine dolu olabilir.
  IFS= read -r pid < "$PIDFILE" || true
  case $pid in
    ''|*[!0-9]*) echo "[stop] gecersiz pid dosyasi: $PIDFILE" ;;
    *) PIDS="$pid" ;;
  esac
fi

# Pid dosyasi yoksa veya eski kopyalar kalmissa Linux /proc uzerinden bul.
if [ -d /proc ]; then
  for dir in /proc/[0-9]*; do
    [ -r "$dir/cmdline" ] || continue
    pid=${dir#/proc/}
    cmd=$(tr '\0' ' ' < "$dir/cmdline" 2>/dev/null) || continue
    case $cmd in
      *"$MARKER"*)
        case " $PIDS " in
          *" $pid "*) ;;
          *) PIDS="${PIDS:+$PIDS }$pid" ;;
        esac
        ;;
    esac
  done
fi

if [ -z "$PIDS" ]; then
  echo "[stop] calisan surec bulunamadi"
  rm -f "$PIDFILE"
  exit 0
fi

status=0
for pid in $PIDS; do
  stop_pid "$pid" || status=1
done

rm -f "$PIDFILE"
exit "$status"
