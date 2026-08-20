from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("caricamento", "0023_righe_duplicate_origine"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="oggettodacaricare",
            options={
                "ordering": ["piano_di_carico", "priorita", "oggetto__codice", "id"],
                "verbose_name": "Oggetto da Caricare",
                "verbose_name_plural": "Oggetti da Caricare",
            },
        ),
    ]
