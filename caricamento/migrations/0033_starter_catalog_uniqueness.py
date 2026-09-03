from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("caricamento", "0032_fungies_payment_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="oggetto",
            name="codice",
            field=models.CharField(
                help_text="Codice univoco dell'oggetto (es. SKU, barcode, part number).",
                max_length=64,
            ),
        ),
        migrations.AlterField(
            model_name="contenitore",
            name="nome",
            field=models.CharField(
                help_text="Nome identificativo del contenitore (es. 'Camion A-123').",
                max_length=128,
            ),
        ),
        migrations.AddConstraint(
            model_name="oggetto",
            constraint=models.UniqueConstraint(
                fields=("owner", "codice"),
                name="unique_oggetto_per_owner",
            ),
        ),
        migrations.AddConstraint(
            model_name="contenitore",
            constraint=models.UniqueConstraint(
                fields=("owner", "nome"),
                name="unique_contenitore_per_owner",
            ),
        ),
    ]
