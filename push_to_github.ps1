# ================================================
#  push_to_github.ps1
#  Aggiorna GitHub con le ultime modifiche
#
#  Uso:  .\push_to_github.ps1 "messaggio commit"
#  Oppure: .\push_to_github.ps1
#          (chiede il messaggio interattivamente)
# ================================================

cd C:\progetti_python\carico_aut_man3

# Prende il messaggio come argomento o lo chiede
if ($args.Count -gt 0) {
    $messaggio = $args[0]
} else {
    $messaggio = Read-Host "Messaggio del commit"
}

Write-Host "=== git add . ===" -ForegroundColor Cyan
git add .

Write-Host "=== git commit ===" -ForegroundColor Cyan
git commit -m "$messaggio"

Write-Host "=== git push ===" -ForegroundColor Cyan
git push

Write-Host "=== FATTO! ===" -ForegroundColor Green
