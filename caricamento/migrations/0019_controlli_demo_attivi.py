from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("caricamento", "0018_aggiunto_owner_dati"),
    ]

    operations = [
        migrations.AddField(
            model_name="impostazionisistema",
            name="controlli_demo_attivi",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "Se attivo, IP/browser/cookie impediscono di ottenere più trial "
                    "dallo stesso dispositivo o dalla stessa rete."
                ),
            ),
        ),
    ]
