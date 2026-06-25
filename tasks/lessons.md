# Lessons

## Grading-criteria sweep (2026-06-25)

**Lesson:** Before adding A11y attributes like `aria-invalid` and `aria-describedby` to form fields, audit which fields actually render visible error UI. Blanket-adding ARIA to every input clutters AT output (the field gets announced as invalid even when no error message exists) and creates dangling `aria-describedby` IDs that point to nothing.

**Pattern:**
```tsx
aria-invalid={errors.field ? true : undefined}
aria-describedby={errors.field ? 'field-error-id' : undefined}
```
Using `undefined` (not `false`) lets React omit the attribute when there's no error.

**Why:** `aria-invalid="false"` is a valid value that asserts the field is valid — but if the user hasn't tried to submit yet, the field's state is "untouched", which is different from "valid". Omitting the attribute matches that semantic.

**How to apply:** When fixing form A11y, walk through the existing JSX and only touch inputs that already have an inline error message in the same block. Don't introduce new error rendering.
