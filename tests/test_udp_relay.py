"""Bound datagram relay integration on loopback; no public network access."""
import importlib.util
import socket
import sys
import threading
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("udp_relay", Path(__file__).resolve().parents[1] / "src/diagnostics/udp_relay.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(sys.platform == "darwin", "macOS IP_BOUND_IF relay")
class DatagramRelayTest(unittest.TestCase):
    def test_preserves_datagrams_and_releases_both_sockets(self):
        echo = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        echo.bind(("127.0.0.1", 0))
        echo.settimeout(2)

        def reply():
            packet, peer = echo.recvfrom(65535)
            echo.sendto(packet, peer)

        thread = threading.Thread(target=reply)
        thread.start()
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.settimeout(2)
        try:
            with module.BoundDatagramRelay("lo0", "127.0.0.1", echo.getsockname()[1]) as relay:
                payload = bytes(range(256)) * 4
                client.sendto(payload, ("127.0.0.1", relay.local_port))
                self.assertEqual(client.recvfrom(65535)[0], payload)
                self.assertEqual(relay.stats["client_packets"], 1)
                self.assertEqual(relay.stats["server_packets"], 1)
            self.assertEqual(relay.local.fileno(), -1)
            self.assertEqual(relay.remote.fileno(), -1)
        finally:
            client.close()
            thread.join(timeout=2)
            echo.close()


if __name__ == "__main__":
    unittest.main()
