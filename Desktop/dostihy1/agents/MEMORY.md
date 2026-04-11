# MEMORY.md — Rozhodnutí & poznatky

> Dynamický log. Agenti sem zapisují při každém důležitém rozhodnutí nebo poznatku.
> Nikdy nesmazávat záznamy — pouze přidávat. Starší záznamy archivuj do `memory-archive/`.

---

## Jak přidat záznam

```
### [YYYY-MM-DD] [Agent] — [Stručný název]
**Typ:** rozhodnutí / poznatek / problém / varování
**Kontext:** [V rámci jakého úkolu / situace]
**Obsah:**
[Co bylo rozhodnuto nebo zjištěno]
**Důvod:**
[Proč takto, jaké alternativy byly zvažovány]
**Dopad:**
[Na co to má vliv]
**Zpětně nereverzibilní:** ano / ne
```

---

## Technická rozhodnutí

*(Coding agent zapisuje architektonická a implementační rozhodnutí)*

### [YYYY-MM-DD] Coding agent — Šablona záznamu
**Typ:** rozhodnutí
**Kontext:** TASK-002 — Návrh architektury
**Obsah:**
[Popis rozhodnutí]
**Důvod:**
[Proč jsme zvolili tento přístup místo alternativ]
**Dopad:**
[Co to ovlivní — výkon, složitost, závislosti]
**Zpětně nereverzibilní:** ne

---

## Poznatky z výzkumu

*(Research agent zapisuje klíčové poznatky, které by měly přetrvat mezi konverzacemi)*

### [YYYY-MM-DD] Research agent — Šablona záznamu
**Typ:** poznatek
**Kontext:** TASK-001 — Analýza požadavků
**Obsah:**
[Co bylo zjištěno]
**Důvod záznamu:**
[Proč je to důležité vědět]
**Dopad:**
[Jak to ovlivňuje projekt]
**Zpětně nereverzibilní:** —

---

## Opakující se problémy

*(Review agent zapisuje vzory chyb, které se opakují)*

### [YYYY-MM-DD] Review agent — Šablona záznamu
**Typ:** varování
**Kontext:** Opakuje se v TASK-XXX, TASK-YYY
**Obsah:**
[Popis opakujícího se problému]
**Doporučení:**
[Jak se mu příště vyhnout]
**Dopad:**
[Co se stane, pokud se neopraví]
**Zpětně nereverzibilní:** —

---

## Zamítnuté přístupy

> Záznamy o věcech, které jsme zkoušeli a nefungovaly. Zabraňuje opakování stejných chyb.

### [YYYY-MM-DD] [Agent] — Proč jsme nezvolili [přístup X]
**Typ:** rozhodnutí
**Kontext:** [úkol / situace]
**Obsah:**
Přístup X byl zvažován jako alternativa k přístupu Y.
**Důvod zamítnutí:**
[Konkrétní problém nebo nevýhoda]
**Poučení:**
[Co jsme se naučili]
**Zpětně nereverzibilní:** —

---

## Archiv

*Záznamy starší než 90 dní nebo ze ukončených fází projektu přesuň do `memory-archive/YYYY-MM.md`.*
