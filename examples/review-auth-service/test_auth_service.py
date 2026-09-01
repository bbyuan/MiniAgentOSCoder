import unittest

from auth_service import can_access_admin, hash_password, issue_password_reset_token, issue_session, verify_password


class AuthServiceSmokeTests(unittest.TestCase):
    def test_password_round_trip(self) -> None:
        stored = hash_password("correct horse battery staple")

        self.assertTrue(verify_password("correct horse battery staple", stored))
        self.assertFalse(verify_password("wrong", stored))

    def test_admin_session_gate(self) -> None:
        admin = issue_session("u-1", "admin")
        viewer = issue_session("u-2", "viewer")

        self.assertTrue(can_access_admin(admin))
        self.assertFalse(can_access_admin(viewer))

    def test_reset_token_is_stable_for_demo(self) -> None:
        self.assertEqual(
            issue_password_reset_token("u-1"),
            issue_password_reset_token("u-1"),
        )


if __name__ == "__main__":
    unittest.main()
