# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('caricamento', '0030_impostazionisistema_privacy_email_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='lingua',
            field=models.CharField(
                blank=True,
                default='en',
                help_text="Lingua preferita dell'utente (es. 'it', 'en').",
                max_length=5,
            ),
        ),
    ]
