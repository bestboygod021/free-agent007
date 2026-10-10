export type TutorialLocale = 'fa' | 'en'

export type KeysTutorialTab = 'providers' | 'quotaSignals' | 'apiKey' | 'anthropic' | 'agents'

export type TutorialId =
  | 'models.chat'
  | 'models.fusion'
  | 'models.embeddings'
  | 'models.image'
  | 'models.video'
  | 'models.audio'
  | 'models.chat-detail'
  | 'models.embeddings-detail'
  | 'models.media-detail'
  | 'playground'
  | `keys.${KeysTutorialTab}`
  | 'agents'
  | 'forgepilot'
  | 'analytics'
  | 'logs'
  | 'premium'

export interface TutorialCopy {
  fa: string
  en: string
}

export interface TutorialStep {
  title: TutorialCopy
  where: TutorialCopy
  action: TutorialCopy
  expect: TutorialCopy
}

export interface TabTutorial {
  page: TutorialCopy
  intro: TutorialCopy
  steps: TutorialStep[]
  outcome: TutorialCopy
  tip: TutorialCopy
}

const copy = (fa: string, en: string): TutorialCopy => ({ fa, en })
const step = (
  titleFa: string,
  titleEn: string,
  whereFa: string,
  whereEn: string,
  actionFa: string,
  actionEn: string,
  expectFa: string,
  expectEn: string,
): TutorialStep => ({
  title: copy(titleFa, titleEn),
  where: copy(whereFa, whereEn),
  action: copy(actionFa, actionEn),
  expect: copy(expectFa, expectEn),
})

/** Short, task-oriented flows shown by the help button at the top of each tab. */
export const TAB_TUTORIALS: Record<TutorialId, TabTutorial> = {
  'models.chat': {
    page: copy('مدل‌های گفتگو', 'Chat models'),
    intro: copy(
      'روش انتخاب مدل و ترتیب جایگزینی را تنظیم کنید تا درخواست‌های گفتگویی به مسیر مناسب برسند.',
      'Choose a routing strategy and fallback order so chat requests reach the right model.',
    ),
    steps: [
      step(
        'اتصال ارائه‌دهنده را آماده کنید', 'Connect a provider',
        'کلیدها ← ارائه‌دهندگان', 'Keys → Providers',
        'اگر هنوز کلیدی ندارید، «افزودن کلید» را بزنید و کلید ارائه‌دهنده را اضافه کنید.',
        'If you have no key yet, open “Add key” and add a provider credential.',
        'حداقل یک ارائه‌دهندهٔ قابل استفاده در دسترس است.',
        'At least one provider is ready to serve a model.',
      ),
      step(
        'روش مسیریابی را انتخاب کنید', 'Choose a routing strategy',
        'بخش «استراتژی» بالای فهرست', 'The Strategy section above the list',
        'یکی از روش‌های خودکار را انتخاب کنید؛ تغییر روش فوراً ذخیره می‌شود.',
        'Pick an automatic strategy; strategy changes are saved immediately.',
        'روتر مدل‌ها را بر اساس روش انتخابی رتبه‌بندی می‌کند.',
        'The router ranks models using the selected strategy.',
      ),
      step(
        'ترتیب جایگزینی را تنظیم کنید', 'Set the fallback order',
        'فهرست مدل‌ها', 'The model list',
        'در حالت زنجیرهٔ دستی، ردیف‌ها را جابه‌جا کنید. برای ذخیرهٔ ترتیب جدید، دکمهٔ ذخیرهٔ پایین صفحه را بزنید.',
        'With the manual chain, reorder the rows. Press the save button at the bottom to keep the new order.',
        'اگر مدلی در دسترس نباشد، درخواست به گزینهٔ بعدی می‌رود.',
        'If a model is unavailable, the request can fall through to the next one.',
      ),
      step(
        'یک درخواست آزمایشی بفرستید', 'Send a test request',
        'زمین بازی', 'Playground',
        'یک مدل یا «خودکار» را انتخاب کنید، پیام کوتاهی بنویسید و ارسال را بزنید.',
        'Choose a model or Auto, enter a short prompt, and send it.',
        'پاسخ و ارائه‌دهندهٔ استفاده‌شده را بررسی کنید.',
        'Review the response and the provider that served it.',
      ),
    ],
    outcome: copy(
      'درخواست‌های گفتگو با استراتژی و ترتیب جایگزینی‌ای که تعیین کرده‌اید مسیریابی می‌شوند.',
      'Chat requests are routed using your chosen strategy and fallback order.',
    ),
    tip: copy(
      'اگر فهرست خالی است یا مدلی کار نمی‌کند، اول کلید و فعال‌بودن ارائه‌دهنده را در تب «کلیدها» بررسی کنید.',
      'If the list is empty or a model fails, first check its provider key and enabled state on the Keys tab.',
    ),
  },
  'models.fusion': {
    page: copy('Fusion', 'Fusion'),
    intro: copy(
      'چند مدل را برای یک پاسخ ترکیبی کنار هم قرار دهید و نتیجه را با شناسهٔ fusion فراخوانی کنید.',
      'Combine several models into one response flow, then call it with the fusion model ID.',
    ),
    steps: [
      step(
        'پنل مدل‌ها را بسازید', 'Build the model panel',
        'منبع پنل', 'Panel source',
        '«خودکار» را برای انتخاب خودکار و تعیین اندازهٔ پنل بگذارید؛ یا «دستی» را انتخاب و مدل‌های موردنظر را علامت بزنید.',
        'Choose Auto to set the panel size, or Explicit to pick the models yourself.',
        'مدل‌های پنل برای مقایسه یا ترکیب پاسخ مشخص می‌شوند.',
        'The candidate models for the response are selected.',
      ),
      step(
        'داور و روش نتیجه‌گیری را مشخص کنید', 'Choose the judge and strategy',
        'داور و استراتژی', 'Judge and Strategy',
        'داور را روی خودکار یا یک مدل مشخص بگذارید؛ سپس بین «ترکیب پاسخ‌ها» و «بهترین پاسخ» انتخاب کنید.',
        'Use an automatic or pinned judge, then choose Synthesize or Best of.',
        'Fusion می‌داند چطور پاسخ‌های پنل را ارزیابی کند.',
        'Fusion knows how to evaluate the panel responses.',
      ),
      step(
        'تنظیمات را ذخیره کنید', 'Save your configuration',
        'نوار ذخیرهٔ پایین صفحه', 'The save bar at the bottom',
        'در صورت نیاز نمایش پنل را فعال کنید و «ذخیره» را بزنید.',
        'Optionally expose the panel, then press Save.',
        'تنظیمات جدید در سرور ثبت می‌شوند.',
        'The new configuration is saved on the server.',
      ),
      step(
        'Fusion را امتحان کنید', 'Try Fusion',
        'زمین بازی یا API', 'Playground or API',
        'یک درخواست گفتگو با مدل `fusion` بفرستید؛ نمونهٔ بدنهٔ درخواست در همین صفحه آمده است.',
        'Send a chat request using model `fusion`; this page includes a request example.',
        'پاسخ نهایی از روش ترکیبی انتخاب‌شده پیروی می‌کند.',
        'The final answer follows your selected fusion strategy.',
      ),
    ],
    outcome: copy(
      'یک مدل ترکیبی قابل فراخوانی دارید که از پنل و روش داوری انتخابی استفاده می‌کند.',
      'You have a callable composite model using your chosen panel and judging strategy.',
    ),
    tip: copy(
      'برای مدل‌های دستی، فقط مدل‌های دارای کلید و فعال را انتخاب کنید؛ محدودیت تعداد انتخاب کنار فهرست دیده می‌شود.',
      'For an explicit panel, choose enabled models with provider keys; the selection limit is shown beside the list.',
    ),
  },
  'models.embeddings': {
    page: copy('مدل‌های Embeddings', 'Embedding models'),
    intro: copy(
      'مدل پیش‌فرض و ارائه‌دهندگان هر خانواده را تنظیم کنید و بعد از ذخیره، درخواست embedding بفرستید.',
      'Set a default family and its providers, then save before sending an embedding request.',
    ),
    steps: [
      step(
        'خانوادهٔ پیش‌فرض را انتخاب کنید', 'Choose a default family',
        'کارت‌های خانوادهٔ مدل', 'The model-family cards',
        'کنار خانوادهٔ مناسب روی «پیش‌فرض کردن» بزنید.',
        'Select “Make default” beside the family you want to use by default.',
        'نشان «پیش‌فرض» روی خانوادهٔ انتخابی ظاهر می‌شود.',
        'The selected family gets the Default badge.',
      ),
      step(
        'ارائه‌دهنده‌ها را مرتب و فعال کنید', 'Arrange and enable providers',
        'ردیف‌های هر خانواده', 'Provider rows under each family',
        'ارائه‌دهنده‌های لازم را روشن یا خاموش کنید و ترتیب جایگزینی را با کشیدن ردیف‌ها تغییر دهید.',
        'Enable or disable providers and drag rows to change their fallback order.',
        'ترتیب و وضعیت جدید به‌عنوان تغییر ذخیره‌نشده مشخص می‌شود.',
        'Your edits appear as unsaved changes.',
      ),
      step(
        'تغییرات را ثبت کنید', 'Commit the changes',
        'نوار شناور پایین صفحه', 'The floating bar at the bottom',
        '«ذخیرهٔ تغییرات» را بزنید؛ اگر منصرف شدید، «لغو» را انتخاب کنید.',
        'Press Save changes, or Discard if you want to revert the draft.',
        'تنظیمات جدید ذخیره می‌شوند و نوار تغییرات ناپدید می‌شود.',
        'The new settings are saved and the change bar disappears.',
      ),
      step(
        'درخواست را اجرا کنید', 'Make a request',
        'صفحهٔ جزئیات خانواده یا API', 'The family detail page or API',
        'نام خانواده را باز کنید تا نمونهٔ آماده را ببینید؛ endpoint استاندارد `/v1/embeddings` است.',
        'Open a family to see a ready example; the standard endpoint is `/v1/embeddings`.',
        'بردارهای ورودی با خانواده و ارائه‌دهندهٔ تنظیم‌شده ساخته می‌شوند.',
        'Input text is embedded using the configured family and provider.',
      ),
    ],
    outcome: copy(
      'درخواست‌های embedding از خانوادهٔ پیش‌فرض و ترتیب ارائه‌دهندگان تنظیم‌شده استفاده می‌کنند.',
      'Embedding requests use your default family and configured provider order.',
    ),
    tip: copy(
      'نام خانواده را می‌توان از صفحهٔ جزئیات کپی کرد؛ کلید ارائه‌دهنده باید در تب «کلیدها» موجود باشد.',
      'Copy the family name from its detail page; the provider also needs a key on the Keys tab.',
    ),
  },
  'models.image': {
    page: copy('مدل‌های تصویر', 'Image models'),
    intro: copy(
      'ارائه‌دهندهٔ تصویر را فعال کنید، نمونهٔ مدل را ببینید و اولین تصویر را از API بسازید.',
      'Enable an image provider, inspect a model example, and generate an image through the API.',
    ),
    steps: [
      step(
        'ارائه‌دهنده را آماده کنید', 'Prepare a provider',
        'کلیدها و مدل‌ها', 'Keys and models',
        'برای ارائه‌دهندهٔ تصویر یک کلید اضافه کنید و در این صفحه مدل‌های موجود را بررسی کنید.',
        'Add an image-provider key, then review the available models here.',
        'مدل‌های قابل استفاده در کارت‌های صفحه فهرست می‌شوند.',
        'Usable image models appear in the model cards.',
      ),
      step(
        'مدل و مسیر سرویس را بررسی کنید', 'Inspect a model and endpoint',
        'کارت مدل تصویر', 'An image model card',
        'روی نام مدل بزنید و صفحهٔ جزئیات را باز کنید؛ ارائه‌دهندهٔ فعال و شناسهٔ مدل را بررسی کنید.',
        'Open a model’s detail page and check its enabled provider and model ID.',
        'کد نمونه و مسیر `/v1/images/generations` را می‌بینید.',
        'You can see a ready example and `/v1/images/generations`.',
      ),
      step(
        'درخواست ساخت تصویر بفرستید', 'Send an image-generation request',
        'نمونهٔ API در جزئیات مدل', 'The API example on the model page',
        'نمونه را با کلید خود اجرا کنید و مقدار prompt را با توضیح تصویر دلخواه عوض کنید.',
        'Run the sample with your API key and replace the prompt with your desired image description.',
        'تصویر در پاسخ یا فایل خروجی درخواست برمی‌گردد.',
        'The generated image is returned in the response or request output.',
      ),
    ],
    outcome: copy(
      'یک مسیر فعال برای ساخت تصویر و نمونهٔ API متناسب با شناسهٔ مدل دارید.',
      'You have an enabled image-generation route and an API example for the chosen model.',
    ),
    tip: copy(
      'اگر مدل کلید ندارد یا غیرفعال است، جزئیات مدل را بررسی کنید و ابتدا کلید ارائه‌دهنده را اضافه کنید.',
      'If a model has no key or is disabled, check its details and add the provider key first.',
    ),
  },
  'models.video': {
    page: copy('مدل‌های ویدیو', 'Video models'),
    intro: copy(
      'مدل ویدیو را فعال کنید و با درخواست ویدیویی، خروجی را از endpoint مربوط بسازید.',
      'Enable a video model and create an output through the video-generation endpoint.',
    ),
    steps: [
      step(
        'کلید ارائه‌دهنده را اضافه کنید', 'Add a provider key',
        'کلیدها ← ارائه‌دهندگان', 'Keys → Providers',
        'کلید سرویس ویدیویی موردنظر را ثبت کنید و به تب مدل‌های ویدیو برگردید.',
        'Add a key for the video service, then return to Video models.',
        'مدل‌های آن ارائه‌دهنده با وضعیت دسترسی نمایش داده می‌شوند.',
        'That provider’s models appear with their availability state.',
      ),
      step(
        'مدل را بازبینی کنید', 'Review a model',
        'فهرست مدل‌های ویدیو', 'The Video models list',
        'مدل را باز کنید، ارائه‌دهنده را فعال نگه دارید و شناسهٔ مدل را از جزئیات بردارید.',
        'Open a model, keep the intended provider enabled, and note its model ID.',
        'نمونهٔ درخواست و مسیر `/v1/videos/generations` آماده است.',
        'A request example and `/v1/videos/generations` are shown.',
      ),
      step(
        'ویدیو را بسازید', 'Generate a video',
        'کد نمونهٔ جزئیات مدل', 'The model detail example',
        'prompt را تنظیم کنید و درخواست را با کلید یکپارچه اجرا کنید.',
        'Set your prompt and run the request with your unified API key.',
        'ویدیو در خروجی درخواست ذخیره یا دریافت می‌شود.',
        'The video is returned or saved as the request output.',
      ),
    ],
    outcome: copy(
      'یک مدل ویدیویی قابل فراخوانی با مسیر و شناسهٔ درست پیدا کرده‌اید.',
      'You have identified a callable video model with the correct route and model ID.',
    ),
    tip: copy(
      'ساخت ویدیو ممکن است زمان‌بر باشد؛ خطا یا وضعیت پردازش را از Logs و Analytics پیگیری کنید.',
      'Video generation can take time; use Logs and Analytics to follow errors and request status.',
    ),
  },
  'models.audio': {
    page: copy('مدل‌های صوتی', 'Audio models'),
    intro: copy(
      'در این تب هم گفتار به صوت ساخته می‌شود و هم می‌توانید مدل‌های تبدیل گفتار به متن را پیدا کنید.',
      'This tab covers both text-to-speech and speech-to-text model routes.',
    ),
    steps: [
      step(
        'نوع کار را انتخاب کنید', 'Choose the audio task',
        'بخش گفتار یا تبدیل گفتار به متن', 'Text-to-speech or Speech-to-text section',
        'برای ساخت صدا، بخش گفتار را ببینید؛ برای رونویسی فایل صوتی، پایین صفحه بخش تبدیل گفتار به متن را پیدا کنید.',
        'Use Text-to-speech to create audio, or the Speech-to-text section lower down to transcribe a file.',
        'فهرست مدل‌های همان کار نمایش داده می‌شود.',
        'Models for that task are listed.',
      ),
      step(
        'کلید و مدل را بررسی کنید', 'Check the key and model',
        'کارت مدل صوتی', 'An audio-model card',
        'در صورت نبود کلید، از تب «کلیدها» آن را اضافه کنید؛ سپس جزئیات مدل و ارائه‌دهندهٔ فعال را بررسی کنید.',
        'If no key is available, add one on Keys; then review the model details and enabled provider.',
        'نمونهٔ درخواست آمادهٔ همان مدل را می‌بینید.',
        'You can see a ready request example for that model.',
      ),
      step(
        'نمونهٔ مناسب را اجرا کنید', 'Run the matching example',
        'صفحهٔ جزئیات مدل', 'The model detail page',
        'برای تولید گفتار از `/v1/audio/speech` و برای رونویسی از `/v1/audio/transcriptions` استفاده کنید.',
        'Use `/v1/audio/speech` for speech generation and `/v1/audio/transcriptions` for transcription.',
        'فایل صوتی ساخته یا متن تشخیص‌داده‌شده برگردانده می‌شود.',
        'You receive generated audio or the recognized text.',
      ),
    ],
    outcome: copy(
      'می‌دانید برای هر کار صوتی کدام مدل و endpoint را باید فراخوانی کنید.',
      'You know which model and endpoint to call for each audio task.',
    ),
    tip: copy(
      'ضبط ورودی میکروفون در زمین بازی از مدل‌های رونویسی استفاده می‌کند؛ اگر گزینه‌ای نمی‌بینید، مدل STT را بررسی کنید.',
      'Playground microphone dictation uses transcription models; check that an STT model is available if the option is missing.',
    ),
  },
  'models.chat-detail': {
    page: copy('جزئیات مدل گفتگو', 'Chat model details'),
    intro: copy(
      'اینجا ارائه‌دهندگان یک مدل، وضعیت دسترسی، تنظیمات مدل و نمونهٔ درخواست را بررسی می‌کنید.',
      'Review the providers, availability, model settings, and request example for this chat model.',
    ),
    steps: [
      step(
        'وضعیت ارائه‌دهنده‌ها را ببینید', 'Check provider availability',
        'بخش ارائه‌دهندگان مدل', 'The model providers section',
        'برای هر ارائه‌دهنده بررسی کنید کلید دارد و فعال است؛ ارائه‌دهندگان لازم را روشن یا خاموش کنید.',
        'Check that each provider has a key and is enabled; toggle providers as needed.',
        'مسیرهای قابل استفاده و گزینه‌های جایگزین مشخص می‌شوند.',
        'Available routes and fallback options become clear.',
      ),
      step(
        'شناسهٔ قابل استفاده را کپی کنید', 'Copy the usable model ID',
        'شناسهٔ مدل و کد نمونه', 'Model ID and request example',
        'شناسهٔ یکپارچهٔ مدل را کپی کنید؛ نمونهٔ آماده، کلید و endpoint را هم بررسی کنید.',
        'Copy the unified model ID and review the ready example, key, and endpoint.',
        'درخواست شما به‌جای شناسهٔ خام ارائه‌دهنده از شناسهٔ درست استفاده می‌کند.',
        'Your request uses the right ID instead of a provider-specific one.',
      ),
      step(
        'درخواست را آزمایش کنید', 'Test the request',
        'API یا زمین بازی', 'API or Playground',
        'درخواست نمونه را اجرا کنید یا همان مدل را در زمین بازی انتخاب کنید.',
        'Run the sample request or choose this model in Playground.',
        'پاسخ را ببینید و در صورت خطا، مسیر ارائه‌دهنده را دوباره بررسی کنید.',
        'Review the response and revisit provider routing if it fails.',
      ),
    ],
    outcome: copy(
      'شناسهٔ مناسب و دست‌کم یک مسیر فعال برای فراخوانی مدل را دارید.',
      'You have the correct model ID and at least one active route to call it.',
    ),
    tip: copy(
      'مدل خام ارائه‌دهنده و شناسهٔ یکپارچه یکی نیستند؛ برای API از شناسه‌ای که صفحه به‌عنوان مدل نشان می‌دهد استفاده کنید.',
      'A provider’s raw ID may differ from the unified ID; use the model ID shown by this page in API calls.',
    ),
  },
  'models.embeddings-detail': {
    page: copy('جزئیات مدل Embeddings', 'Embedding model details'),
    intro: copy(
      'شناسه، ارائه‌دهندگان و نمونهٔ درخواست embedding را برای این خانواده ببینید.',
      'Find this family’s ID, providers, and a ready-to-run embedding request.',
    ),
    steps: [
      step(
        'ارائه‌دهندهٔ فعال را بررسی کنید', 'Check enabled providers',
        'بخش ارائه‌دهندگان', 'The Providers section',
        'مطمئن شوید برای یکی از ارائه‌دهندگان کلید ثبت شده و ردیف آن فعال است.',
        'Make sure at least one provider has a key and is enabled.',
        'مسیر اجرای درخواست در دسترس است.',
        'A route is ready to serve the request.',
      ),
      step(
        'نام خانواده را بردارید', 'Get the family name',
        'عنوان مدل و کد نمونه', 'Model heading and request example',
        'نام خانواده را کپی یا از نمونهٔ همین صفحه بردارید.',
        'Copy the family name or take it from the example on this page.',
        'شناسهٔ model برای بدنهٔ درخواست آماده است.',
        'The model value is ready for your request body.',
      ),
      step(
        'متن را به embedding تبدیل کنید', 'Create an embedding',
        'endpoint `/v1/embeddings`', 'The `/v1/embeddings` endpoint',
        'نمونه را با کلید یکپارچه و متن ورودی خود اجرا کنید.',
        'Run the example with your unified key and input text.',
        'بردار خروجی برای متن شما برمی‌گردد.',
        'The response contains a vector for your input text.',
      ),
    ],
    outcome: copy(
      'درخواست embedding با خانوادهٔ انتخاب‌شده و یک ارائه‌دهندهٔ فعال اجرا می‌شود.',
      'An embedding request runs with the selected family and an enabled provider.',
    ),
    tip: copy(
      'اگر بیش از یک ارائه‌دهنده فعال باشد، ترتیب جایگزینی را از صفحهٔ اصلی Embeddings تنظیم کنید.',
      'If several providers are enabled, manage their fallback order on the main Embeddings page.',
    ),
  },
  'models.media-detail': {
    page: copy('جزئیات مدل رسانه‌ای', 'Media model details'),
    intro: copy(
      'این صفحه برای بررسی مسیر ارائه‌دهنده، کپی شناسه و اجرای نمونهٔ صوت، تصویر یا ویدیو است.',
      'Use this page to check providers, copy the model ID, and run an audio, image, or video example.',
    ),
    steps: [
      step(
        'ارائه‌دهندهٔ مناسب را روشن کنید', 'Enable the intended provider',
        'فهرست ارائه‌دهندگان مدل', 'The model providers list',
        'وضعیت کلید و کلید روشن/خاموش هر ارائه‌دهنده را بررسی کنید.',
        'Check each provider’s key status and enabled switch.',
        'حداقل یک مسیر قابل اجرا برای مدل مشخص است.',
        'At least one usable route is available for the model.',
      ),
      step(
        'شناسهٔ مدل را کپی کنید', 'Copy the model ID',
        'ردیف ارائه‌دهنده', 'The provider row',
        'شناسهٔ مدل موردنظر را کپی کنید یا از نمونهٔ درخواست پایین صفحه استفاده کنید.',
        'Copy the intended model ID or use the request example lower on the page.',
        'درخواست با مدل و ارائه‌دهندهٔ موردنظر ساخته می‌شود.',
        'The request targets the intended model and provider.',
      ),
      step(
        'درخواست رسانه‌ای را بفرستید', 'Send the media request',
        'کد نمونهٔ API', 'The API example',
        'نمونه را با کلید خود اجرا کنید؛ مسیر endpoint براساس نوع مدل در نمونه درج شده است.',
        'Run the example with your key; its endpoint matches the model modality.',
        'خروجی تصویر، ویدیو، صوت یا متن رونویسی‌شده را دریافت می‌کنید.',
        'You receive an image, video, audio file, or transcription.',
      ),
    ],
    outcome: copy(
      'یک درخواست رسانه‌ای متناسب با نوع مدل و مسیر فعال آماده دارید.',
      'You have a media request matched to the model type and an enabled route.',
    ),
    tip: copy(
      'نمونهٔ هر صفحه را مبنا قرار دهید؛ endpoint تولید تصویر، ویدیو، گفتار و رونویسی با هم فرق دارند.',
      'Use the page’s own example; image, video, speech, and transcription endpoints differ.',
    ),
  },
  playground: {
    page: copy('زمین بازی', 'Playground'),
    intro: copy(
      'با نوشتن یک پیام، مسیریابی مدل را آزمایش کنید و نتیجه را همان‌جا ببینید.',
      'Test model routing by sending a prompt and reviewing the response right here.',
    ),
    steps: [
      step(
        'مدل را انتخاب کنید', 'Choose a model',
        'نوار تنظیمات کنار گفتگو', 'The settings rail beside the chat',
        '«خودکار» را برای مسیریابی خودکار بگذارید یا یک مدل مشخص مثل `fusion` را انتخاب کنید.',
        'Keep Auto for automatic routing, or choose a specific model such as `fusion`.',
        'پیام بعدی با انتخاب شما مسیریابی می‌شود.',
        'Your next message follows that model selection.',
      ),
      step(
        'پیام را آماده کنید', 'Prepare your prompt',
        'کادر پیام', 'The message composer',
        'در صورت نیاز system prompt یا تنظیمات sampling را تغییر دهید؛ سپس پیام خود را بنویسید.',
        'Optionally adjust the system prompt or sampling settings, then enter your message.',
        'پیام آمادهٔ ارسال است؛ فایل و تصویر را هم می‌توانید پیوست کنید.',
        'Your message is ready; files and images can also be attached.',
      ),
      step(
        'ارسال و پاسخ را بررسی کنید', 'Send and review',
        'دکمهٔ ارسال', 'The Send button',
        'ارسال را بزنید یا از میانبر صفحه‌کلید استفاده کنید؛ هنگام پاسخ، گفتگو به انتهای پیام می‌رود.',
        'Press Send or use the keyboard shortcut; the chat follows the response as it arrives.',
        'پاسخ مدل و اطلاعات مسیر اجرا در گفتگو قابل مشاهده است.',
        'The model response and routing information are visible in the chat.',
      ),
      step(
        'گفتگو را نگه دارید یا ادامه دهید', 'Keep or continue the chat',
        'فهرست گفتگوها', 'The conversation list',
        'پیام بعدی را برای ادامه بفرستید؛ برای شروع از صفر «گفتگوی جدید» را انتخاب کنید.',
        'Send another prompt to continue, or choose New chat to start over.',
        'گفتگوهای ذخیره‌شده از فهرست کناری دوباره باز می‌شوند.',
        'Saved conversations can be reopened from the sidebar.',
      ),
    ],
    outcome: copy(
      'یک گفتگوی آزمایشی انجام داده‌اید و پاسخ مدل انتخاب‌شده را دیده‌اید.',
      'You have completed a test chat and seen the selected model’s response.',
    ),
    tip: copy(
      'اگر پاسخ نمی‌گیرید، اول در تب «کلیدها» وجود کلید و سلامت ارائه‌دهنده را بررسی کنید.',
      'If no response arrives, first check provider keys and health on the Keys tab.',
    ),
  },
  'keys.providers': {
    page: copy('کلیدهای ارائه‌دهندگان', 'Provider keys'),
    intro: copy(
      'کلیدهای سرویس‌های مدل را اضافه یا وارد کنید و بعد از ثبت، دسترسی ارائه‌دهنده را بررسی کنید.',
      'Add or import model-provider credentials, then verify that the provider is available.',
    ),
    steps: [
      step(
        'روش افزودن را انتخاب کنید', 'Choose how to add a key',
        'دکمهٔ «افزودن کلید»', 'The Add key button',
        'ارائه‌دهنده را انتخاب کنید؛ می‌توانید کلید را دستی وارد، از فایل import یا endpoint سازگار تعریف کنید.',
        'Choose a provider; paste a key, import a file, or configure a compatible endpoint.',
        'اطلاعات اتصال در فرم مربوط وارد می‌شود.',
        'Your connection details are entered in the matching form.',
      ),
      step(
        'اتصال را بررسی کنید', 'Verify the connection',
        'فهرست ارائه‌دهندگان', 'The provider list',
        'پس از افزودن، وضعیت کلید و مدل‌های کشف‌شده را ببینید؛ در صورت نیاز مدل‌ها را دوباره کشف یا تست کنید.',
        'After adding it, review key status and discovered models; rediscover or test models if needed.',
        'ارائه‌دهنده و مدل‌های قابل استفاده مشخص می‌شوند.',
        'The provider and available models are identified.',
      ),
      step(
        'کلید را نگه‌داری کنید', 'Keep the key safe',
        'دکمه‌های export و backup', 'Export and backup controls',
        'در صورت نیاز از export یا backup استفاده کنید؛ خروجی کلیدها را در محل امن نگه دارید.',
        'Use export or backup if needed, and store key exports securely.',
        'برای بازیابی بعدی نسخه‌ای امن از تنظیمات دارید.',
        'You have a secure copy for later recovery.',
      ),
    ],
    outcome: copy(
      'حداقل یک ارائه‌دهنده با کلید معتبر برای استفاده در مدل‌ها آماده است.',
      'At least one provider has a valid key and is ready to serve models.',
    ),
    tip: copy(
      'فایل export ممکن است حاوی اطلاعات حساس باشد؛ آن را مثل رمز عبور محافظت کنید و عمومی به اشتراک نگذارید.',
      'An export may contain secrets; protect it like a password and never share it publicly.',
    ),
  },
  'keys.quotaSignals': {
    page: copy('سیگنال‌های سهمیه', 'Quota signals'),
    intro: copy(
      'سلامت و محدودیت‌های ارائه‌دهندگان را ببینید تا پیش از خطا متوجه نزدیک‌شدن به سقف مصرف شوید.',
      'Review provider health and quota signals so you can spot limits before requests fail.',
    ),
    steps: [
      step(
        'وضعیت‌ها را تازه کنید', 'Refresh provider status',
        'دکمهٔ «بررسی همه»', 'The Check all button',
        'برای دریافت وضعیت تازهٔ همهٔ کلیدها «بررسی همه» را بزنید.',
        'Press Check all to refresh the status of every provider key.',
        'وضعیت‌ها و سیگنال‌های سهمیه دوباره دریافت می‌شوند.',
        'Provider status and quota signals are refreshed.',
      ),
      step(
        'سهمیه و محدودیت را بخوانید', 'Read the quota and limit signals',
        'کارت‌ها و رویدادهای سهمیه', 'Quota cards and events',
        'به وضعیت هر ارائه‌دهنده، زمان بازنشانی یا محدودیت و رویدادهای اخیر توجه کنید.',
        'Review each provider’s status, reset or cooldown time, and recent events.',
        'می‌فهمید کدام ارائه‌دهنده فعلاً محدود یا در دسترس است.',
        'You can see which providers are available or temporarily limited.',
      ),
      step(
        'مسیر جایگزین را بررسی کنید', 'Check the fallback route',
        'تب مدل‌ها', 'The Models tab',
        'اگر ارائه‌دهنده‌ای محدود است، در صفحهٔ مدل‌ها فعال‌بودن گزینه‌های جایگزین و ترتیب مسیریابی را بررسی کنید.',
        'If a provider is limited, check enabled alternatives and routing order on Models.',
        'در صورت امکان درخواست‌ها به ارائه‌دهندهٔ دیگری می‌روند.',
        'When possible, requests can fall back to another provider.',
      ),
    ],
    outcome: copy(
      'می‌دانید کدام ارائه‌دهنده آماده است و برای محدودیت‌ها چه مسیر جایگزینی دارید.',
      'You know which providers are ready and what fallback options you have for limits.',
    ),
    tip: copy(
      'بررسی سهمیه مقدار واقعیِ مصرف را از حساب ارائه‌دهنده نمی‌سازد؛ سیگنال‌های موجود را با داشبورد همان سرویس تطبیق دهید.',
      'Quota checks report available signals; compare them with the provider’s own dashboard for authoritative usage.',
    ),
  },
  'keys.apiKey': {
    page: copy('کلید API یکپارچه', 'Unified API key'),
    intro: copy(
      'از یک آدرس و کلید محلی برای اتصال برنامه‌ها به مدل‌های چند ارائه‌دهنده استفاده کنید.',
      'Use one local base URL and key to connect apps to models from multiple providers.',
    ),
    steps: [
      step(
        'کلید و آدرس پایه را بردارید', 'Get the key and base URL',
        'بخش کلید یکپارچه', 'The Unified key section',
        'در صورت نیاز کلید را نمایش دهید و کپی کنید؛ آدرس پایه و endpointهای نمایش‌داده‌شده را هم یادداشت کنید.',
        'Reveal and copy the key if needed; note the displayed base URL and endpoints.',
        'مقادیر `API_KEY` و `BASE_URL` برای برنامهٔ شما آماده است.',
        'Your app’s `API_KEY` and `BASE_URL` values are ready.',
      ),
      step(
        'برنامهٔ کلاینت را تنظیم کنید', 'Configure a client',
        'پروفایل‌ها و تنظیمات proxy', 'Client profiles and proxy settings',
        'پروفایل آمادهٔ برنامهٔ خود را انتخاب یا تنظیم کنید و URL سازگار با نوع کلاینت را وارد کنید.',
        'Choose or edit a profile for your client and use the URL format appropriate to it.',
        'کلاینت به API یکپارچهٔ همین نصب وصل می‌شود.',
        'The client is connected to this installation’s unified API.',
      ),
      step(
        'اتصال را آزمایش کنید', 'Test the connection',
        'نمونهٔ Quick start یا زمین بازی', 'Quick start sample or Playground',
        'نمونهٔ درخواست را اجرا کنید یا یک پیام در زمین بازی بفرستید.',
        'Run a quick-start request or send a prompt in Playground.',
        'پاسخ موفق نشان می‌دهد آدرس و کلید درست تنظیم شده‌اند.',
        'A successful response confirms the URL and key are configured correctly.',
      ),
    ],
    outcome: copy(
      'برنامهٔ شما با یک کلید محلی به endpoint یکپارچه وصل است.',
      'Your app is connected to the unified endpoint with one local key.',
    ),
    tip: copy(
      'بازسازی کلید، مقدار قبلی را باطل می‌کند؛ پس از آن کلید جدید را در همهٔ کلاینت‌ها جایگزین کنید.',
      'Regenerating the key revokes the old one; update every client that uses it.',
    ),
  },
  'keys.anthropic': {
    page: copy('سازگاری Anthropic', 'Anthropic compatibility'),
    intro: copy(
      'مدل‌های Claude را به مدل‌های فعال خود وصل کنید و یک کلاینت Anthropic را به API محلی بفرستید.',
      'Map Claude model names to your enabled models and point an Anthropic client at the local API.',
    ),
    steps: [
      step(
        'نگاشت خانواده‌ها را انتخاب کنید', 'Map the model families',
        'ردیف‌های Default، Opus، Sonnet و Haiku', 'The Default, Opus, Sonnet, and Haiku rows',
        'برای هر خانواده «خودکار» یا یک مدل فعال را انتخاب کنید.',
        'Choose Auto or a specific enabled model for each family.',
        'نام‌های Claude به مدل‌هایی که انتخاب کرده‌اید نگاشت می‌شوند.',
        'Claude model names route to the models you selected.',
      ),
      step(
        'تنظیمات را ذخیره کنید', 'Save the mapping',
        'دکمهٔ ذخیره', 'The Save button',
        'بعد از تغییر گزینه‌ها، «ذخیره» را بزنید.',
        'After changing the selectors, press Save.',
        'نگاشت جدید روی سرور ثبت می‌شود.',
        'The new mapping is stored on the server.',
      ),
      step(
        'کلاینت را به آدرس محلی وصل کنید', 'Connect your client to the local API',
        'Base URL و روش احراز هویت', 'Base URL and authentication',
        'در کلاینت Anthropic آدرس پایهٔ نشان‌داده‌شده را وارد کنید و از روش `x-api-key` استفاده کنید.',
        'Use the displayed base URL in your Anthropic client and authenticate with `x-api-key`.',
        'درخواست Messages از مسیر سازگار با Anthropic عبور می‌کند.',
        'Messages requests go through the Anthropic-compatible route.',
      ),
    ],
    outcome: copy(
      'کلاینت Anthropic می‌تواند از نگاشت‌ها و مدل‌های فعال این نصب استفاده کند.',
      'An Anthropic client can use this installation’s mappings and enabled models.',
    ),
    tip: copy(
      'اگر مدل مقصد در فهرست نیست، ابتدا آن را در تب مدل‌ها فعال کنید؛ فقط مدل‌های فعال برای انتخاب نمایش داده می‌شوند.',
      'If a target is missing, enable it on the Models tab first; only enabled models are selectable.',
    ),
  },
  'keys.agents': {
    page: copy('سازگاری Agentها', 'Agent compatibility'),
    intro: copy(
      'سازگاری Gemini، Ollama و MCP را تنظیم کنید یا برای یک integration توکن URL جداگانه بسازید.',
      'Configure Gemini, Ollama, or MCP compatibility, or create a separate URL token for an integration.',
    ),
    steps: [
      step(
        'نگاشت مدل Gemini را تعیین کنید', 'Set Gemini model mappings',
        'بخش نگاشت خانواده‌های Gemini', 'The Gemini family mapping section',
        'برای خانواده‌های Default، Pro، Flash و Flash Lite گزینهٔ خودکار یا مدل فعال را انتخاب و ذخیره کنید.',
        'Choose Auto or an enabled model for Default, Pro, Flash, and Flash Lite, then save.',
        'نام‌های Gemini به مدل‌های انتخابی مسیریابی می‌شوند.',
        'Gemini family names route to your selected models.',
      ),
      step(
        'سازگاری و MCP را تنظیم کنید', 'Set compatibility and MCP options',
        'گزینه‌های Ollama و MCP', 'Ollama and MCP options',
        'حالت Ollama، aliasهای Claude و فعال‌بودن MCP را مطابق کلاینت خود تنظیم کنید.',
        'Set Ollama mode, Claude discovery aliases, and MCP availability for your client.',
        'endpointها با نیاز کلاینت شما سازگار می‌شوند.',
        'The endpoints match your client’s compatibility needs.',
      ),
      step(
        'در صورت نیاز توکن جدا بسازید', 'Create a separate token if needed',
        'توکن‌های URL', 'URL tokens',
        'یک برچسب وارد کنید و توکن بسازید؛ توکن تازه را همان لحظه کپی و امن نگه دارید.',
        'Enter a label and create a token; copy the new token immediately and store it securely.',
        'برای آن integration یک credential مستقل دارید که بعداً قابل لغو است.',
        'That integration has a separate credential that can be revoked later.',
      ),
    ],
    outcome: copy(
      'کلاینت‌های Agent از نگاشت‌ها و روش احراز هویت مناسب خود استفاده می‌کنند.',
      'Agent clients can use the mappings and authentication method that fit them.',
    ),
    tip: copy(
      'توکن تازه ممکن است فقط هنگام ساخت کامل نمایش داده شود؛ پیش از بستن صفحه آن را در محل امن ذخیره کنید.',
      'A new token may only be shown when created; store it securely before leaving the page.',
    ),
  },
  agents: {
    page: copy('اتصال ابزارهای توسعه', 'Developer tool setup'),
    intro: copy(
      'برای اتصال یک ابزار کدنویسی از دستور نصب آماده استفاده کنید و بعد فعالیت آن را بررسی کنید.',
      'Use a ready setup command to connect a coding tool, then confirm its activity.',
    ),
    steps: [
      step(
        'کارت ابزار را پیدا کنید', 'Find your tool',
        'کارت‌های ابزار', 'The tool cards',
        'ابزار یا Agent موردنظر را پیدا کنید؛ هر کارت روش setup و نوع endpoint مناسبش را نشان می‌دهد.',
        'Find your agent; each card shows its setup method and endpoint format.',
        'می‌دانید از دستور خودکار استفاده کنید یا تنظیمات را دستی بچینید.',
        'You know whether to use the setup command or configure it manually.',
      ),
      step(
        'دستور یا تنظیمات را کپی کنید', 'Copy the command or config',
        'دکمهٔ کپی در همان کارت', 'The Copy button on that card',
        'نمونه را کپی کنید و آن را در ترمینال یا فایل تنظیمات ابزار اجرا/جای‌گذاری کنید.',
        'Copy the snippet and run it in a terminal or paste it into the tool’s config file.',
        'ابزار با URL این نصب و کلید یکپارچه تنظیم می‌شود.',
        'The tool is configured with this installation’s URL and unified key.',
      ),
      step(
        'فعالیت را تأیید کنید', 'Confirm activity',
        'بخش استفادهٔ اخیر', 'The recent-usage section',
        'یک درخواست از ابزار بفرستید و سپس نشان فعالیت یا Analytics را بررسی کنید.',
        'Send a request from the tool, then check its activity badge or Analytics.',
        'درخواست ابزار در داده‌های مصرف این نصب دیده می‌شود.',
        'The tool’s request appears in this installation’s usage data.',
      ),
    ],
    outcome: copy(
      'ابزار توسعه با endpoint محلی وصل شده و می‌توانید درخواست‌های آن را دنبال کنید.',
      'Your developer tool is connected to the local endpoint and its requests are trackable.',
    ),
    tip: copy(
      'اگر دستور نصب، URL یا کلید تازه‌ای نشان می‌دهد، همان مقدار کارت را مبنا بگذارید؛ کلید را در گزارش عمومی قرار ندهید.',
      'If the setup command shows a URL or key, use the card’s current value; never paste secrets into public logs.',
    ),
  },
  forgepilot: {
    page: copy('ForgePilot', 'ForgePilot'),
    intro: copy(
      'این صفحه برای مقایسهٔ پروفایل‌های Free، Paid و Local است؛ انتخاب اینجا اجرای کار یا تغییر تنظیمات Agent را شروع نمی‌کند.',
      'This page compares Free, Paid, and Local profiles. Selecting one here does not run a task or change an Agent configuration.',
    ),
    steps: [
      step(
        'یک پروفایل را انتخاب کنید', 'Select a profile',
        'دکمه‌های Free، Paid و Local', 'The Free, Paid, and Local buttons',
        'هر پروفایل را انتخاب کنید تا اطلاعات همان گزینه بارگذاری شود.',
        'Select a profile to load its reference details.',
        'کارت‌های صفحه براساس پروفایل انتخابی به‌روزرسانی می‌شوند.',
        'The page cards update for the selected profile.',
      ),
      step(
        'سیاست و بودجه را بخوانید', 'Review policy and budget',
        'کارت‌های سیاست ارائه‌دهنده و بودجه', 'Provider policy and budget cards',
        'دسترسی cloud/local، حریم خصوصی، سقف بودجه و gateهای قبل از اجرا را با نیاز خود مقایسه کنید.',
        'Compare cloud/local access, privacy, budget limits, and pre-run gates against your needs.',
        'تفاوت ریسک‌ها و محدودیت‌های هر پروفایل روشن می‌شود.',
        'The trade-offs and limits of each profile become clear.',
      ),
      step(
        'پرامپت و وضعیت را بررسی کنید', 'Inspect prompts and states',
        'بخش promptها و stateها', 'Prompts and states sections',
        'متن‌های راهنما و وضعیت‌های نمایش‌داده‌شده را بخوانید و گزینه‌ها را مقایسه کنید.',
        'Read the displayed prompt guidance and states to compare the options.',
        'برای ادامهٔ طراحی، خلاصهٔ مناسب با سیاست‌های خود دارید.',
        'You have a policy-aware reference for the next design step.',
      ),
    ],
    outcome: copy(
      'پروفایل مناسب‌تری برای بررسی انتخاب کرده‌اید؛ این صفحه خودش Agent task اجرا نمی‌کند.',
      'You have identified a profile to consider; this page itself does not execute an Agent task.',
    ),
    tip: copy(
      'انتخاب Free/Paid/Local در این صفحه فقط state محلیِ نمایشی است و با عوض‌کردن صفحه ذخیره نمی‌شود.',
      'The Free/Paid/Local selection is display-only local state and is not persisted when you leave the page.',
    ),
  },
  analytics: {
    page: copy('تحلیل مصرف', 'Usage analytics'),
    intro: copy(
      'با انتخاب بازهٔ زمانی، میزان درخواست، هزینهٔ تخمینی، تأخیر و عملکرد ارائه‌دهندگان را بررسی کنید.',
      'Choose a time range to review requests, estimated savings, latency, and provider performance.',
    ),
    steps: [
      step(
        'بازهٔ زمانی را تنظیم کنید', 'Set the time range',
        'گزینه‌های ۲۴ ساعت، ۷، ۳۰ یا ۹۰ روز', 'The 24h, 7d, 30d, or 90d range control',
        'بازه‌ای را انتخاب کنید که با پرسش شما دربارهٔ مصرف هماهنگ باشد.',
        'Choose the range that matches the usage question you are investigating.',
        'کارت‌ها و نمودارهای بازهٔ انتخابی تازه می‌شوند.',
        'The summary cards and charts refresh for that range.',
      ),
      step(
        'نمای کلی را بخوانید', 'Read the overview',
        'کارت‌های خلاصه و نمودارها', 'Summary cards and charts',
        'تعداد درخواست و موفقیت، tokenها، latency، صرفه‌جویی و سهم provider/model را با هم بررسی کنید.',
        'Review requests and success, tokens, latency, savings, and provider/model breakdowns together.',
        'مشخص می‌شود مصرف یا خطا در کدام بازه/مسیر تغییر کرده است.',
        'You can spot where usage or errors changed in the selected range.',
      ),
      step(
        'درخواست خاص را پیدا کنید', 'Find a specific request',
        'جدول درخواست‌های اخیر', 'The Recent calls table',
        'فیلتر وضعیت یا ارائه‌دهنده را انتخاب کنید، ستون‌ها را مرتب کنید و یک ردیف را برای جزئیات باز کنید.',
        'Filter by status or provider, sort the columns, and open a row for its details.',
        'جزئیات درخواست برای بررسی یا عیب‌یابی نمایش داده می‌شود.',
        'Request details are shown for investigation or debugging.',
      ),
    ],
    outcome: copy(
      'الگوی کلی مصرف و درخواست‌های نیازمند بررسی را پیدا کرده‌اید.',
      'You have identified the overall usage pattern and any calls that need attention.',
    ),
    tip: copy(
      'عدد صرفه‌جویی تخمینی است؛ برای صورت‌حساب قطعی، به گزارش ارائه‌دهندهٔ مدل مراجعه کنید.',
      'Savings are estimates; use the model provider’s report for authoritative billing.',
    ),
  },
  logs: {
    page: copy('گزارش رویدادها', 'Logs'),
    intro: copy(
      'رویدادهای زنده را با فیلتر سطح و ارائه‌دهنده پیدا کنید و جزئیات خطا را باز کنید.',
      'Find live events with level and provider filters, then expand an entry to inspect errors.',
    ),
    steps: [
      step(
        'جریان گزارش را کنترل کنید', 'Control the live stream',
        'دکمهٔ مکث/ادامه', 'The Pause/Resume button',
        'برای ثابت‌کردن فهرست «مکث» و برای دریافت رویدادهای تازه «ادامه» را بزنید.',
        'Press Pause to hold the list, or Resume to receive new events.',
        'خواندن رویدادها بدون حرکت مداوم صفحه آسان‌تر می‌شود.',
        'The list is easier to inspect without continuous movement.',
      ),
      step(
        'نتایج را محدود کنید', 'Narrow the results',
        'فیلتر سطح، ارائه‌دهنده و جستجو', 'Level, provider, and search filters',
        'سطح‌های لازم را انتخاب کنید، در صورت نیاز ارائه‌دهنده را محدود و متن پیام یا رویداد را جستجو کنید.',
        'Choose the levels you need, optionally filter a provider, and search event text.',
        'فقط رویدادهای مرتبط در فهرست می‌مانند.',
        'Only relevant events remain in the list.',
      ),
      step(
        'جزئیات را بررسی کنید', 'Inspect the details',
        'ردیف گزارش', 'A log row',
        'روی «نمایش بیشتر» بزنید تا پیام بلند باز شود؛ اگر از پایین صفحه جدا شده‌اید از «رفتن به آخرین» استفاده کنید.',
        'Expand a long message with Show more; use Jump to latest if you have scrolled away from the tail.',
        'متن کامل رویداد یا جدیدترین گزارش را می‌بینید.',
        'You can read the full event or return to the newest log.',
      ),
    ],
    outcome: copy(
      'رویداد مرتبط را با متن کامل و زمینهٔ ارائه‌دهنده/مدل پیدا کرده‌اید.',
      'You have found the relevant event with its full text and provider/model context.',
    ),
    tip: copy(
      '«پاک‌کردن» گزارش‌ها عملی برگشت‌ناپذیر است؛ فقط وقتی نیاز دارید از آن استفاده کنید.',
      'Clear permanently removes logs; use it only when you intend to clear them.',
    ),
  },
  premium: {
    page: copy('مجوز و کاتالوگ Premium', 'Premium license and catalog'),
    intro: copy(
      'وضعیت feed را ببینید، در صورت داشتن مجوز آن را فعال کنید و بعد کاتالوگ را همگام سازید.',
      'Review the catalog feed, activate a license if you have one, and then sync the catalog.',
    ),
    steps: [
      step(
        'وضعیت feed را ببینید', 'Check the feed status',
        'بخش Catalog feed', 'The Catalog feed section',
        'زنده یا snapshot بودن کاتالوگ، نسخه و زمان آخرین بررسی را بخوانید.',
        'Review whether the catalog is live or a snapshot, its version, and last check time.',
        'می‌دانید اطلاعات کاتالوگ از چه وضعیتی آمده است.',
        'You know which catalog source and update status you are using.',
      ),
      step(
        'مجوز را فعال یا مدیریت کنید', 'Activate or manage the license',
        'بخش License', 'The License section',
        'کلید مجوز را وارد و فعال کنید؛ اگر از قبل فعال است، وضعیت طرح یا دکمهٔ مدیریت را بررسی کنید.',
        'Enter and activate your license key, or review the plan and management action if already licensed.',
        'وضعیت اعتبار مجوز و طرح نمایش داده می‌شود.',
        'The license validity and plan are shown.',
      ),
      step(
        'کاتالوگ را همگام کنید', 'Sync the catalog',
        'دکمهٔ بررسی به‌روزرسانی', 'The Check for updates button',
        'پس از فعال‌سازی یا وقتی کاتالوگ قدیمی است، همگام‌سازی را آغاز کنید.',
        'Start a sync after activation or whenever the catalog is out of date.',
        'آخرین snapshot/feed در نصب شما اعمال می‌شود.',
        'The latest snapshot/feed is applied to your installation.',
      ),
    ],
    outcome: copy(
      'وضعیت مجوز و نسخهٔ کاتالوگ روشن است و در صورت نیاز همگام شده است.',
      'Your license and catalog version are clear, and the catalog is synced if needed.',
    ),
    tip: copy(
      'کلید مجوز را مانند رمز عبور نگه‌داری کنید. اگر ندارید، این صفحه راهنمای دریافت یا بازیابی آن را نشان می‌دهد.',
      'Treat the license key like a password. If you do not have one, this page links to purchase or recovery information.',
    ),
  },
}

export function keysTutorialId(tab: KeysTutorialTab): `keys.${KeysTutorialTab}` {
  return `keys.${tab}`
}

function cleanPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  const withoutTrailingSlash = path.replace(/\/+$/, '')
  return withoutTrailingSlash || '/'
}

function endsWithRoute(path: string, route: string): boolean {
  return path === route || path.endsWith(route)
}

/** Resolves the visible route to its tutorial. A caller may override this for sub-tabs. */
export function tutorialIdForPath(pathname: string): TutorialId | null {
  const path = cleanPath(pathname)

  if (/(^|\/)models\/chat\/[^/]+$/.test(path)) return 'models.chat-detail'
  if (/(^|\/)models\/embeddings\/[^/]+$/.test(path)) return 'models.embeddings-detail'
  if (/(^|\/)models\/(image|video|audio|transcription)\/[^/]+$/.test(path)) return 'models.media-detail'

  const routeMap: Array<[string, TutorialId]> = [
    ['/models/chat', 'models.chat'],
    ['/models/fusion', 'models.fusion'],
    ['/models/embeddings', 'models.embeddings'],
    ['/models/image', 'models.image'],
    ['/models/video', 'models.video'],
    ['/models/audio', 'models.audio'],
    ['/playground', 'playground'],
    ['/keys', 'keys.providers'],
    ['/agents', 'agents'],
    ['/forgepilot', 'forgepilot'],
    ['/analytics', 'analytics'],
    ['/logs', 'logs'],
    ['/premium', 'premium'],
  ]

  return routeMap.find(([route]) => endsWithRoute(path, route))?.[1] ?? null
}
