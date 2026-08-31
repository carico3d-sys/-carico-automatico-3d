from django.db import migrations, models
import django.core.validators


def clear_legacy_provider_ids(apps, schema_editor):
    """Gli ID Lemon non sono riutilizzabili come ID Fungies."""
    UserProfile = apps.get_model("caricamento", "UserProfile")
    UserProfile.objects.filter(
        models.Q(fungies_customer_id__isnull=False)
        | models.Q(fungies_subscription_id__isnull=False)
    ).update(
        fungies_customer_id=None,
        fungies_subscription_id=None,
        fungies_plan="",
        is_paying=False,
    )


def preserve_no_legacy_provider_ids(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("caricamento", "0031_userprofile_lingua"),
    ]

    operations = [
        migrations.RenameField(
            model_name="userprofile",
            old_name="ls_customer_id",
            new_name="fungies_customer_id",
        ),
        migrations.RenameField(
            model_name="userprofile",
            old_name="ls_subscription_id",
            new_name="fungies_subscription_id",
        ),
        migrations.RenameField(
            model_name="userprofile",
            old_name="ls_quantity",
            new_name="fungies_quantity",
        ),
        migrations.RenameField(
            model_name="userprofile",
            old_name="ls_plan",
            new_name="fungies_plan",
        ),
        migrations.RemoveField(
            model_name="userprofile",
            name="ls_subscription_item_id",
        ),
        migrations.RemoveField(
            model_name="userprofile",
            name="ls_variant_id",
        ),
        migrations.RunPython(clear_legacy_provider_ids, preserve_no_legacy_provider_ids),
        migrations.AlterField(
            model_name="userprofile",
            name="fungies_customer_id",
            field=models.CharField(blank=True, help_text="ID cliente su Fungies.io.", max_length=255, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="userprofile",
            name="fungies_subscription_id",
            field=models.CharField(blank=True, help_text="ID abbonamento attivo su Fungies.io.", max_length=255, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="userprofile",
            name="fungies_quantity",
            field=models.PositiveSmallIntegerField(default=1, help_text="Numero di utenti (seat) acquistati nell'abbonamento.", validators=[django.core.validators.MinValueValidator(1)]),
        ),
        migrations.AlterField(
            model_name="userprofile",
            name="fungies_plan",
            field=models.CharField(blank=True, default="", help_text="Nome del piano acquistato (es. 'Mensile', 'Annuale').", max_length=32),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="fungies_offer_id",
            field=models.CharField(blank=True, help_text="ID offer Fungies.io scelta (mensile/annuale).", max_length=255, null=True),
        ),
        migrations.CreateModel(
            name="FungiesWebhookEvent",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_id", models.CharField(max_length=255, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Evento Webhook Fungies",
                "verbose_name_plural": "Eventi Webhook Fungies",
            },
        ),
    ]
