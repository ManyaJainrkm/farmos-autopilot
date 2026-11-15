"""Replay simulated NMEA fixes to a configured local AgIO UDP input."""

import argparse
import socket
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--interval", default=1.0, type=float)
    args = parser.parse_args()
    if not 0 < args.port < 65536 or args.interval < 0:
        parser.error("Supply a valid UDP port and a nonnegative interval.")
    sentences = args.file.read_text(encoding="ascii").splitlines()
    frames = []
    for line in sentences:
        body, separator, checksum = line.partition("*")
        value = 0
        for char in body[1:]:
            value ^= ord(char)
        if not body.startswith(("$GPGGA,", "$GPVTG,")) or not separator or checksum != f"{value:02X}":
            parser.error("The replay contains an invalid NMEA sentence.")
        if body.startswith("$GPGGA,"):
            frames.append([])
        if not frames:
            parser.error("The first sentence must be a GGA fix.")
        frames[-1].append(line)

    if not frames:
        parser.error("The replay contains no GPS fixes.")
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
        for index, frame in enumerate(frames):
            if index:
                time.sleep(args.interval)
            for line in frame:
                udp.sendto((line + "\r\n").encode("ascii"), ("127.0.0.1", args.port))
    print(f"Sent {len(frames)} fixes to localhost:{args.port}.")


if __name__ == "__main__":
    main()
