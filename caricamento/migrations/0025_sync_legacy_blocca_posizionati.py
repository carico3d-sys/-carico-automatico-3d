from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("caricamento", "0024_alter_oggettodacaricare_options"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        'ALTER TABLE "caricamento_pianodicarico" '
                        'ADD COLUMN IF NOT EXISTS "blocca_posizionati" '
                        'boolean NOT NULL DEFAULT FALSE'
                    ),
                    reverse_sql=(
                        'ALTER TABLE "caricamento_pianodicarico" '
                        'DROP COLUMN IF EXISTS "blocca_posizionati"'
                    ),
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="pianodicarico",
                    name="blocca_posizionati",
                    field=models.BooleanField(
                        default=False,
                        help_text="Compatibilità legacy: non utilizzato dall'ottimizzatore corrente.",
                    ),
                ),
            ],
        ),
    ]
