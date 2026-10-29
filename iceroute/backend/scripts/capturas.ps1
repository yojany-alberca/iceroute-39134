# Ayuda para tomar las 46 capturas del capítulo 2 (sección 2.5.1 a 2.5.23).
# Uso (desde la carpeta backend, en PowerShell):   .\scripts\capturas.ps1
# Para cada RF muestra primero la fase ROJA y luego la VERDE. Cuando aparezca el resultado,
# captura la ventana (Win + Shift + S) y guarda la imagen como RFxx_rojo.png / RFxx_verde.png.
$rfs = "RF01","RF02","RF04","RF05","RF06","RF09","RF12","RF13","RF14","RF15","RF16","RF17","RF19","RF21","RF25","RF27","RF28","RF30","RF31","RF32","RF42","RF46","RF47"
foreach ($rf in $rfs) {
  $archivo = $rf.ToLower()
  Clear-Host; Write-Host "=== $rf  FASE ROJA ===" -ForegroundColor Red
  npx jest --config jest.red.config.js --verbose $archivo
  Read-Host "Captura y guarda como ${rf}_rojo.png. Presiona Enter para la fase verde"
  Clear-Host; Write-Host "=== $rf  FASE VERDE ===" -ForegroundColor Green
  npx jest --verbose $archivo
  Read-Host "Captura y guarda como ${rf}_verde.png. Presiona Enter para el siguiente RF"
}
