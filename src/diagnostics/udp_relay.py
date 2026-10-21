#!/usr/bin/env python3
"""Interface-bound loopback UDP relay shared by native QUIC diagnostics."""
import json
import select
import socket
import sys
import threading

class BoundDatagramRelay:
    """Preserve QUIC datagrams while routing upstream UDP through one interface."""

    def __init__(self, interface, address, port=443):
        self.interface = interface
        self.address = address
        self.port = port
        self.stop = threading.Event()
        self.stats = {"client_packets": 0, "server_packets": 0,
                      "client_bytes": 0, "server_bytes": 0}

    def __enter__(self):
        self.local = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        family = socket.AF_INET6 if ":" in self.address else socket.AF_INET
        self.remote = socket.socket(family, socket.SOCK_DGRAM)
        try:
            self.local.bind(("127.0.0.1", 0))
            self.local_port = self.local.getsockname()[1]
            interface = self.interface if isinstance(self.interface, int) else socket.if_nametoindex(self.interface)
            if sys.platform == 'darwin':
                self.remote.setsockopt(socket.IPPROTO_IPV6 if family == socket.AF_INET6 else socket.IPPROTO_IP,
                                       125 if family == socket.AF_INET6 else 25, interface)
            elif sys.platform.startswith('linux'):
                name = socket.if_indextoname(interface)
                self.remote.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, name.encode() + b'\0')
            else:
                raise RuntimeError('Interface-bound UDP relay requires macOS or Linux')
            self.remote.connect((self.address, self.port))
            self.stats["local_address"], self.stats["source_port"] = self.remote.getsockname()[:2]
        except BaseException:
            self.local.close()
            self.remote.close()
            raise
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()
        return self

    def run(self):
        peer = None
        try:
            while not self.stop.is_set():
                ready, _, _ = select.select([self.local, self.remote], [], [], .1)
                for source in ready:
                    data, sender = source.recvfrom(65535)
                    if source is self.local:
                        if peer is None:
                            peer = sender
                        if sender != peer:
                            continue
                        self.stats["client_packets"] += 1
                        self.stats["client_bytes"] += len(data)
                        self.remote.send(data)
                    elif peer is not None:
                        self.stats["server_packets"] += 1
                        self.stats["server_bytes"] += len(data)
                        self.local.sendto(data, peer)
        except OSError as error:
            self.stats["relay_error"] = str(error)

    def __exit__(self, *unused):
        self.stop.set()
        self.thread.join(timeout=1)
        self.local.close()
        self.remote.close()


if __name__ == '__main__':
    with BoundDatagramRelay(sys.argv[1], sys.argv[2], int(sys.argv[3])) as relay:
        print(json.dumps({'port': relay.local_port}), flush=True)
        sys.stdin.buffer.read()
