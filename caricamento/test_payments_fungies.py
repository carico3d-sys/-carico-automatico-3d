import hashlib
import hmac
import json

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import UserProfile


class TestPagamentiFungies(TestCase):
    """Test del checkout ospitato e dei webhook Fungies."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="fungies-user",
            email="fungies@example.com",
            password="test-password",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @override_settings(
        FUNGIES_STORE_URL="https://demo.fungies.io",
        FUNGIES_OFFER_MENSILE_ID="offer-monthly",
        FUNGIES_OFFER_ANNUALE_ID="offer-yearly",
        FUNGIES_CHECKOUT_ELEMENT_MENSILE_ID="element-monthly",
        FUNGIES_CHECKOUT_ELEMENT_ANNUALE_ID="element-yearly",
    )
    def test_checkout_restituisce_elemento_ospitato_e_seat(self):
        response = self.client.post(
            "/api/payments/checkout/",
            {"plan": "mensile", "quantity": 3},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["url"],
            "https://demo.fungies.io/checkout-element/element-monthly",
        )
        self.assertEqual(response.data["quantity"], 3)
        self.assertEqual(
            response.data["custom_fields"]["carico3d_user_id"],
            str(self.user.id),
        )

    @override_settings(FUNGIES_WEBHOOK_SECRET="webhook-secret")
    def test_webhook_payment_success_e_idempotenza(self):
        payload = {
            "id": "event-payment-1",
            "idempotencyKey": "event-payment-1",
            "type": "payment_success",
            "data": {
                "items": [{
                    "quantity": 4,
                    "offer": {"id": "offer-monthly"},
                    "customFields": {"carico3d_user_id": str(self.user.id)},
                }],
                "user": {
                    "id": "customer-1",
                    "email": self.user.email,
                },
                "payment": {"status": "PAID"},
            },
        }
        raw = json.dumps(payload).encode("utf-8")
        signature = hmac.new(
            b"webhook-secret", raw, hashlib.sha256
        ).hexdigest()

        first = self.client.post(
            "/api/payments/webhook/",
            raw,
            content_type="application/json",
            HTTP_X_FNGS_SIGNATURE="sha256_" + signature,
        )
        duplicate = self.client.post(
            "/api/payments/webhook/",
            raw,
            content_type="application/json",
            HTTP_X_FNGS_SIGNATURE="sha256_" + signature,
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(duplicate.status_code, 200)
        self.assertTrue(duplicate.data["duplicate"])
        profile = UserProfile.objects.get(user=self.user)
        self.assertTrue(profile.is_paying)
        self.assertEqual(profile.fungies_quantity, 4)
        self.assertEqual(profile.fungies_customer_id, "customer-1")

    @override_settings(FUNGIES_WEBHOOK_SECRET="webhook-secret")
    def test_webhook_rifiuta_firma_non_valida(self):
        response = self.client.post(
            "/api/payments/webhook/",
            b'{"id":"event-invalid","type":"payment_success","data":{}}',
            content_type="application/json",
            HTTP_X_FNGS_SIGNATURE="sha256-invalid",
        )

        self.assertEqual(response.status_code, 401)
