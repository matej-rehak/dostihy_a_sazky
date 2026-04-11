# TASKS.md — Fronta úkolů

> Živý dokument. Orchestrátor přidává úkoly, agenti je přebírají a aktualizují stav.
> Formát stavu: `todo` → `in_progress` → `review` → `done` | `blocked` | `needs_revision`

---

## Jak přidat úkol (orchestrátor)

```
### TASK-{číslo}: {Název úkolu}
**Stav:** todo
**Priorita:** critical / high / medium / low
**Přiřazeno:** {jméno agenta}
**Závisí na:** TASK-{číslo} (nebo "—")
**Termín:** {datum nebo "—"}
**Popis:**
[Co přesně má agent udělat]
**Akceptační kritéria:**
- [ ] ...
**Výstup do:** outputs/{složka}/
```

---

## 🔴 Kritické (critical)

*(žádné aktuálně)*

---

## 🟠 Vysoká priorita (high)

### TASK-001: Analýza požadavků projektu
**Stav:** todo
**Priorita:** high
**Přiřazeno:** research-agent
**Závisí na:** —
**Termín:** —
**Popis:**
Prozkoumej doménu projektu, identifikuj klíčové požadavky, konkurenční řešení a technologické možnosti. Výstup použije coding-agent pro architekturu.

**Akceptační kritéria:**
- [ ] Souhrn domény (min. 500 slov)
- [ ] Seznam min. 3 konkurenčních řešení s porovnáním
- [ ] Technologická doporučení s odůvodněním
- [ ] CONFIDENCE ≥ MEDIUM

**Výstup do:** `outputs/research/analysis-001.md`

---

### TASK-002: Návrh architektury
**Stav:** todo
**Priorita:** high
**Přiřazeno:** coding-agent
**Závisí na:** TASK-001
**Termín:** —
**Popis:**
Na základě výstupu TASK-001 navrhni softwarovou architekturu. Zahrň diagram komponent, datový model a API kontrakt.

**Akceptační kritéria:**
- [ ] Diagram architektury (Mermaid nebo ASCII)
- [ ] Popis každé komponenty
- [ ] Datový model (hlavní entity a vztahy)
- [ ] API kontrakt (endpointy, metody, příklady)
- [ ] Zaznamenat rozhodnutí do MEMORY.md

**Výstup do:** `outputs/code/architecture.md`

---

## 🟡 Střední priorita (medium)

### TASK-003: Review architektury
**Stav:** todo
**Priorita:** medium
**Přiřazeno:** review-agent
**Závisí na:** TASK-002
**Termín:** —
**Popis:**
Zkontroluj navrženu architekturu z hlediska: škálovatelnosti, bezpečnosti, udržovatelnosti a souladu s požadavky z TASK-001.

**Akceptační kritéria:**
- [ ] Výstup obsahuje APPROVED nebo NEEDS_REVISION
- [ ] Každý problém má přiřazenou závažnost
- [ ] Podmínky pro schválení jsou konkrétní a měřitelné

**Výstup do:** `outputs/reviews/review-arch-003.md`

---

### TASK-004: Technická dokumentace
**Stav:** todo
**Priorita:** medium
**Přiřazeno:** writer-agent
**Závisí na:** TASK-002, TASK-003
**Termín:** —
**Popis:**
Na základě schválené architektury napiš README a technickou dokumentaci pro vývojáře.

**Akceptační kritéria:**
- [ ] README s instalací a quickstart
- [ ] Popis každého modulu
- [ ] Příklady použití API
- [ ] Glossář pojmů

**Výstup do:** `outputs/content/documentation-004.md`

---

## 🟢 Nízká priorita (low)

*(přidej úkoly zde)*

---

## ✅ Dokončené (done)

*(úkoly se přesouvají sem po schválení)*

---

## 🚫 Blokované (blocked)

*(úkoly čekající na vnější podmínky)*

---

## Statistiky

| Stav | Počet |
|------|-------|
| todo | 4 |
| in_progress | 0 |
| review | 0 |
| done | 0 |
| blocked | 0 |

*Aktualizuj tabulku při každé změně stavu.*
