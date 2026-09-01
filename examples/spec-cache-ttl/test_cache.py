import unittest

from cache import SimpleCache


class Clock:
    def __init__(self) -> None:
        self.value = 1000.0

    def now(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class SimpleCacheTTLTests(unittest.TestCase):
    def test_get_returns_value_before_ttl_expires(self) -> None:
        clock = Clock()
        cache = SimpleCache[str](now=clock.now)

        cache.set("session", "active", ttl_seconds=30)
        clock.advance(29)

        self.assertEqual(cache.get("session"), "active")

    def test_get_evicts_value_after_ttl_expires(self) -> None:
        clock = Clock()
        cache = SimpleCache[str](now=clock.now)

        cache.set("session", "active", ttl_seconds=30)
        clock.advance(31)

        self.assertIsNone(cache.get("session"))
        self.assertFalse(cache.delete("session"))

    def test_none_ttl_keeps_existing_forever_behavior(self) -> None:
        clock = Clock()
        cache = SimpleCache[str](now=clock.now)

        cache.set("feature", "enabled")
        clock.advance(9999)

        self.assertEqual(cache.get("feature"), "enabled")

    def test_clear_expired_returns_removed_count(self) -> None:
        clock = Clock()
        cache = SimpleCache[str](now=clock.now)

        cache.set("a", "one", ttl_seconds=1)
        cache.set("b", "two", ttl_seconds=10)
        cache.set("c", "three")
        clock.advance(2)

        self.assertEqual(cache.clear_expired(), 1)
        self.assertIsNone(cache.get("a"))
        self.assertEqual(cache.get("b"), "two")
        self.assertEqual(cache.get("c"), "three")


if __name__ == "__main__":
    unittest.main()
