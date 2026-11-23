# Starts the RetailIQ API and website, each in its own window
$root = $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd '$root'; .venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000"

Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd '$root\web'; npm run dev -- -H 0.0.0.0"

Start-Sleep -Seconds 10
Start-Process "http://localhost:3000"
