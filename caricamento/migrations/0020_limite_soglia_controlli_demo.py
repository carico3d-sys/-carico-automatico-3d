from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


def normalizza_soglia(apps, schema_editor):
    impostazioni = apps.get_model("caricamento", "ImpostazioniSistema")
    impostazioni.objects.filter(soglia_controlli_demo__lt=1).update(
        soglia_controlli_demo=1
    )
    impostazioni.objects.filter(soglia_controlli_demo__gt=3).update(
        soglia_controlli_demo=3
    )


def annulla_normalizzazione(apps, schema_editor):
    # La normalizzazione non è reversibile: il valore precedente non è noto.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("caricamento", "0019_controlli_demo_attivi"),
    ]

    operations = [
        migrations.AlterField(
            model_name="impostazionisistema",
            name="soglia_controlli_demo",
            field=models.PositiveSmallIntegerField(
                default=1,
                validators=[MinValueValidator(1), MaxValueValidator(3)],
                help_text=(
                    "Numero minimo di controlli (su 3) che devono matchare per "
                    "bloccare un utente demo. 1 = basta 1 match, 3 = tutti e 3."
                ),
            ),
        ),
        migrations.RunPython(normalizza_soglia, annulla_normalizzazione),
    ]
