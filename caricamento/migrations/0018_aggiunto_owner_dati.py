from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("caricamento", "0017_userprofile_impostazioni_ottimizzatore"),
    ]

    operations = [
        migrations.AddField(
            model_name="contenitore",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                help_text="Utente proprietario del contenitore.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="contenitori",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="oggetto",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                help_text="Utente proprietario dell'oggetto.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="oggetti",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="pianodicarico",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                help_text="Utente proprietario del piano di carico.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="piani_di_carico",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
