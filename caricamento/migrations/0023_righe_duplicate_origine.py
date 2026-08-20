from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("caricamento", "0022_remove_pianodicarico_soluzioni_alternative"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="oggettodacaricare",
            unique_together=set(),
        ),
        migrations.AddField(
            model_name="oggettoposizionato",
            name="riga_origine",
            field=models.ForeignKey(
                blank=True,
                help_text="Riga del pannello da cui proviene questo oggetto; una riga può avere più istanze.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="oggetti_posizionati",
                to="caricamento.oggettodacaricare",
            ),
        ),
    ]
