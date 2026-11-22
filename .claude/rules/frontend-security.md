---
paths:
  - "frontend/imdb-ui-angular/src/**"
---

# Angular UI: rendering user content

- **Never render user content as HTML.** Show it with interpolation
  (`{{ }}`) or property bindings to text. Don't bind it to `[innerHTML]`,
  pass it through `DomSanitizer.bypassSecurityTrust*`, or write it into
  the DOM through `ElementRef.nativeElement`.
