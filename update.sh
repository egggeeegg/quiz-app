#!/bin/bash
# Run parse_docx.py to generate questions.json, then seed the database
set -e
cd "$(dirname "$0")"
echo "=== Step 1: Parse docx files (optional) ==="
if [ -f parse_docx.py ]; then
  python3 parse_docx.py 2>/dev/null || python parse_docx.py
else
  echo "parse_docx.py not found, using existing questions.json"
fi
echo "=== Step 2: Seed database ==="
cd backend
npx node src/seed.js
echo "=== Done ==="
