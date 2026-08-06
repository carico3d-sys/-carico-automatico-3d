"""Template tags per estendere l'admin Django con conteggi e utility."""

from django import template
from django.apps import apps

register = template.Library()


@register.simple_tag
def count_label(app_model: str) -> int:
    """Restituisce il numero di record per un modello nella forma 'app_label.ModelName'.

    Esempio: {% count_label "auth.User" as user_count %}
    """
    try:
        model = apps.get_model(app_model)
        return model.objects.count()
    except (LookupError, ValueError):
        return 0
