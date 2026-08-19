"""
URL configuration per l'API REST dell'ottimizzazione carico 3D.

Utilizza DefaultRouter per generare automaticamente le URL
per i ViewSet con le operazioni CRUD standard.
"""

from django.contrib.auth import views as auth_views
from django.urls import include, path
from django.views.generic.base import RedirectView
from rest_framework.routers import DefaultRouter

from . import views

# ---------------------------------------------------------------------------
# Router principale
# ---------------------------------------------------------------------------

router = DefaultRouter()
router.register(r"contenitori", views.ContenitoreViewSet, basename="contenitore")
router.register(r"oggetti", views.OggettoViewSet, basename="oggetto")
router.register(r"piani", views.PianoDiCaricoViewSet, basename="piano")
router.register(r"vincoli-tra-oggetti", views.VincoloTraOggettiViewSet, basename="vincolo-tra-oggetti")

# ---------------------------------------------------------------------------
# Pattern URL
# ---------------------------------------------------------------------------

app_name = "caricamento"

urlpatterns = [
    # Autenticazione
    path("login/", RedirectView.as_view(url="/", permanent=False), name="login"),
    path("logout/", auth_views.LogoutView.as_view(
        next_page="/"
    ), name="logout"),
    # Logout completo: cancella sessione e forza scelta account Google
    path("logout-completo/", views.logout_completo, name="logout_completo"),

    # Homepage
    path("", views.homepage, name="homepage"),
    # Le URL dei ViewSet sono generate automaticamente dal router
    path("api/", include(router.urls)),
    # Workspace (Single-Page App) — sostituisce il vecchio visualizzatore
    path("workspace/", views.workspace, name="workspace"),
    path("workspace/<int:piano_id>/", views.workspace, name="workspace_piano"),
    # Redirect dal vecchio visualizzatore al nuovo workspace
    path("visualizzatore/", views.visualizzatore_3d, name="visualizzatore_3d"),
    path("visualizzatore/<int:piano_id>/", views.visualizzatore_3d, name="visualizzatore_3d_piano"),

    # Preferenze personali del workspace/ottimizzatore
    path(
        "api/impostazioni_ottimizzatore/",
        views.api_impostazioni_ottimizzatore,
        name="api_impostazioni_ottimizzatore",
    ),
    # Gestione Icone (Admin only)
    path("api/icone-config/", views.api_icone_config, name="api_icone_config"),
    path("api/icone-upload/", views.api_icone_upload, name="api_icone_upload"),
    path("api/icone-file/", views.api_icone_file_delete, name="api_icone_file_delete"),
    # Helper landing: verifica esistenza username (form login/registrazione)
    path("api/check-username/", views.check_username, name="check_username"),
]
