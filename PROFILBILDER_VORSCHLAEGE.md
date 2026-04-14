# Vorschläge: Profilbilder in FinanzApp integrieren

## Kontext

Die App nutzt **MongoDB (Atlas)** als primäre Datenbank, **Node.js** als Backend ohne Framework,
und **Vanilla JS** im Frontend. Authentifizierung ist bereits vollständig implementiert.

---

## Option 1 – Base64 direkt in MongoDB (einfachste Lösung)

**Idee:** Das Bild wird clientseitig zu einem Base64-String konvertiert und direkt im
User-Dokument in MongoDB gespeichert (z. B. im Feld `profileImage`).

**Ablauf:**
1. User wählt Bild via `<input type="file">`
2. Frontend liest die Datei mit `FileReader.readAsDataURL()`
3. Base64-String wird per `PUT /api/user/profile-image` an den Server gesendet
4. Server speichert den String im User-Dokument in MongoDB

**Vorteile:**
- Keine neue Infrastruktur nötig
- Kein zusätzlicher Speicher-Dienst
- Einfach zu implementieren (passt gut zur bestehenden Architektur)

**Nachteile:**
- MongoDB-Dokumente werden sehr groß (Limit: 16 MB pro Dokument)
- Schlechte Performance bei großen Bildern oder vielen Usern
- Empfehlung: Bilder auf max. **100–200 KB** / **200×200 px** begrenzen

**Empfehlung:** Gut geeignet als schnelle Lösung für ein Uni-Projekt mit wenigen Nutzern.

---

## Option 2 – Dateisystem auf dem Server (klassisch)

**Idee:** Bilder werden als echte Dateien auf dem Server gespeichert, MongoDB speichert
nur den Dateipfad/Dateinamen.

**Ablauf:**
1. Frontend sendet das Bild als `multipart/form-data` (z. B. mit `FormData`)
2. Backend speichert die Datei z. B. unter `backend/uploads/avatars/<userId>.jpg`
3. MongoDB-Dokument erhält nur den relativen Pfad, z. B. `/uploads/avatars/<userId>.jpg`
4. Server liefert die Dateien als statische Ressource aus

**Vorteile:**
- Klar getrennte Zuständigkeiten (DB = Metadaten, Dateisystem = Binärdaten)
- Gut skalierbar für mittelgroße Anwendungen
- Einfach mit dem bestehenden Node.js-Server umsetzbar (`fs`-Modul)

**Nachteile:**
- Bilder gehen verloren, wenn der Server neu deployed wird (kein persistenter Speicher)
- Eigene Upload-Logik nötig (Dateivalidierung, Größenlimit, MIME-Typ-Prüfung)
- Kein eingebauter CDN

**Empfehlung:** Gute Wahl für einen lokalen Dev-Server oder wenn ein fester Server
(z. B. AWS EC2) mit persistentem Speicher genutzt wird.

---

## Option 3 – MongoDB GridFS

**Idee:** MongoDB bietet mit **GridFS** eine eingebaute Methode, um Binärdateien
(auch >16 MB) in der Datenbank zu speichern. Dateien werden in Chunks aufgeteilt
und in den Collections `fs.files` und `fs.chunks` abgelegt.

**Ablauf:**
1. Frontend sendet das Bild als `multipart/form-data`
2. Backend nutzt die `GridFSBucket`-API aus dem MongoDB-Treiber
3. Bild wird in der bestehenden MongoDB-Datenbank gespeichert
4. Abruf über eine eigene Route, z. B. `GET /api/user/avatar/<userId>`

**Vorteile:**
- Vollständig innerhalb von MongoDB (keine zweite Infrastruktur)
- Unterstützt große Dateien
- Replikation & Backup laufen automatisch mit der DB mit

**Nachteile:**
- Komplexere Implementierung als Option 1
- Für kleine Avatare (< 16 MB) oft Overkill
- Geringere Performance als ein dedizierter Blob-Storage

**Empfehlung:** Sinnvoll, wenn man bei MongoDB bleiben will und keine externen Dienste
nutzen möchte, aber mehr als Base64 braucht.

---

## Option 4 – Externer Cloud-Speicher (z. B. AWS S3 / Cloudinary)

**Idee:** Bilder werden zu einem dedizierten Speicherdienst hochgeladen. MongoDB
speichert nur die URL.

**Populäre Dienste:**
- **Cloudinary** – kostenfreies Tier, automatische Bildoptimierung & Zuschnitt, CDN inklusive
- **AWS S3** – sehr günstig, hochskalierbar, weit verbreitet
- **Supabase Storage** – Open-Source-Alternative, einfach zu nutzen

**Ablauf (Beispiel Cloudinary):**
1. Frontend lädt Bild hoch → Backend leitet es per API an Cloudinary weiter
2. Cloudinary gibt eine CDN-URL zurück (z. B. `https://res.cloudinary.com/...`)
3. URL wird im User-Dokument in MongoDB gespeichert
4. Im Frontend wird die URL direkt als `<img src="...">` genutzt

**Vorteile:**
- Kein eigener Speicher notwendig
- CDN sorgt für schnelle globale Auslieferung
- Automatische Komprimierung und Formatkonvertierung möglich
- Sehr gut skalierbar

**Nachteile:**
- Externe Abhängigkeit / Vendor Lock-in
- Datenschutz: Bilder liegen auf einem Drittanbieter-Server
- Kosten bei hohem Volumen
- Etwas mehr Einrichtungsaufwand

**Empfehlung:** Ideal für Produktionsumgebungen. Für ein Uni-Projekt eher Overkill,
aber Cloudinary mit Free-Tier wäre der einfachste Einstieg.

---

## Zusammenfassung & Empfehlung

| Option | Aufwand | Skalierbarkeit | Geeignet für |
|---|---|---|---|
| 1 – Base64 in MongoDB | Sehr gering | Gering | Uni-Projekt, wenige User |
| 2 – Dateisystem | Mittel | Mittel | Lokaler/fester Server |
| 3 – GridFS | Mittel-hoch | Mittel | Alles in MongoDB halten |
| 4 – Cloud Storage | Mittel | Sehr hoch | Produktion |

**Für dieses Projekt empfohlen:** **Option 1 (Base64)** als schnellste Lösung,
mit einer clientseitigen Komprimierung (z. B. via `<canvas>`) auf max. 200×200 px
vor dem Upload, um die Dokumentgröße klein zu halten.

---

## Allgemeine Hinweise bei der Implementierung

- **MIME-Typ validieren**: Nur `image/jpeg`, `image/png`, `image/webp` akzeptieren
- **Größenlimit** server- und clientseitig erzwingen (z. B. max. 2 MB Rohdatei)
- **Bild vor Upload skalieren**: Mit einem `<canvas>`-Element auf der Clientseite
- **Kein direkter Pfad-Zugriff** auf Upload-Verzeichnisse ohne Auth-Check (Option 2)
- **Altes Bild löschen**, wenn ein neues hochgeladen wird (gilt für Option 2 & 4)
