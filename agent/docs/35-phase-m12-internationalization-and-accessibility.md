# فاز M12: Internationalization، Localization و Accessibility

**وضعیت:** `designed_only`
**پیش‌نیاز:** M4 Product Experience، M9 Collaboration و M11 Entitlements
**کد اولیه این فاز:** `src/core/i18n.ts`

M12 زبان را از string پراکنده به contract versioned تبدیل می‌کند. فارسی/RTL و
انگلیسی/LTR ابتدا پشتیبانی می‌شوند، اما locale، عدد، تاریخ، direction، accessibility
و fallback باید قابل گسترش باشند.

## ۱. اصول

- message key منبع حقیقت است، نه متن hard-coded در UI.
- catalog دارای locale، version، hash و owner است.
- fallback به `en-US` صریح و قابل گزارش است؛ missing key silent نمی‌شود.
- interpolation از HTML/attribute injection جلوگیری می‌کند.
- number/date/timezone با locale formatter تولید می‌شود.
- user text ترجمه نمی‌شود مگر feature صریح و consent داشته باشد.
- direction از locale می‌آید، اما code، hash، token و path در code block LTR باقی می‌مانند.
- accessibility فقط ترجمه نیست: keyboard، screen reader، focus، contrast و error text gate هستند.

## ۲. Catalog Contract

```ts
interface MessageCatalog {
  locale: "fa-IR" | "en-US";
  messages: Record<string, string>;
  version: string;
  catalogHash: string;
}
```

keyها `product.area.message` شکل دارند و value خالی، key ناشناخته یا variable
حل‌نشده build/test را fail می‌کند. ترجمه نباید policy، approval، budget، error
severity یا tool capability را تغییر دهد.

`resolveMessage` fallback و escaped interpolation می‌دهد. این kernel HTML renderer
نیست؛ UI باید text node و framework escaping را استفاده کند.

## ۳. RTL و Accessibility

### direction matrix

| سطح | فارسی | انگلیسی |
|---|---|---|
| document direction | RTL | LTR |
| code/path/hash | LTR isolate | LTR isolate |
| numbers/cost | locale formatted | locale formatted |
| timeline | logical order | logical order |
| keyboard focus | visible | visible |

### mandatory gates

- axe/ARIA، keyboard-only و focus order
- error message نزدیک input و قابل screen reader
- no color-only status
- contrast و reduced motion
- table sort/filter برای RTL
- screenshot/trace redaction unaffected by locale
- date/timezone و decimal separator deterministic
- plural/select rules versioned

## ۴. Sprintها

### Sprint A: Message Extraction

- key registry و hard-coded string lint
- `fa-IR` و `en-US` base catalogs
- missing/unused key report
- catalog hash و version

### Sprint B: RTL/Formatting

- direction provider
- number/date/currency formatter
- code/path LTR isolation
- timezone/user preference

### Sprint C: Accessibility

- axe، keyboard، focus، screen reader fixtures
- approval/incident/error flows
- localized validation messages
- contrast/reduced motion

### Sprint D: Translation Operations

- review/approval workflow
- machine translation untrusted draft
- release diff و rollback
- pseudo-locale و truncation test

## ۵. Prompt Pack

### `m12-i18n-architect`

```text
نقش: Internationalization Architect

message key، locale، fallback، variables، plural، number/date، direction و version را
طراحی کن. متن hard-coded، variable حل‌نشده، تغییر policy از طریق ترجمه و silent
fallback ممنوع است. code/hash/path را LTR isolate کن.
```

### `m12-rtl-accessibility-reviewer`

```text
نقش: RTL and Accessibility Reviewer

keyboard، focus، screen reader، ARIA، contrast، error placement، reduced motion و
RTL table/timeline را بررسی کن. رنگ تنها status نباشد. screenshot/trace و secret
redaction را در هر دو locale probe کن.
```

### `m12-catalog-gate`

```text
نقش: Localization Evidence Gate

missing/unused key، catalogHash، fallback، variable escaping، number/date snapshot،
pseudo-locale، axe و keyboard results را با command، exit code و artifact ثبت کن.
ترجمه machine-generated فقط draft است و بدون review release نمی‌شود.
```

## ۶. Test و DoD

- invalid key، empty value و missing variable
- preferred/fallback resolution
- interpolation با `<script>` و attribute-like content
- catalog deterministic hash و version
- Persian/English number/date snapshots
- direction و LTR code/path
- plural/truncation/pseudo-locale
- axe، keyboard، focus و screen-reader fixture
- localized approval/error/incident screens
- tenant/user locale isolation

M12 با catalog pipeline، UI integration، accessibility CI و translation review واقعی
از `designed_only` خارج می‌شود. کد فعلی فقط localization boundary قطعی است.
