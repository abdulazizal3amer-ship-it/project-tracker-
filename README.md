<div dir="rtl">

# متتبع المشاريع — Project Tracker

تطبيق ويب خفيف لإدارة المشاريع والمهام لفريق صغير (≈10 أشخاص). الواجهة على **GitHub Pages**، والبيانات والحسابات في **Supabase** (الخطة المجانية). لا خادم تديره بنفسك، والتكلفة صفر.

وثيقة المتطلبات الكاملة: [`docs/BRD.md`](docs/BRD.md)

## ما يتضمنه الإصدار v1.0 (كل متطلبات M)

| الوحدة | المتطلبات |
|---|---|
| الدخول | تسجيل الدخول بالبريد وكلمة المرور، استعادة كلمة المرور بالبريد، إجبار تغيير كلمة المرور المؤقتة، قفل 15 دقيقة بعد 5 محاولات فاشلة، خروج تلقائي بعد 8 ساعات خمول (FR-01، FR-02، NFR-04) |
| المستخدمون | شاشة المدير: إنشاء حساب (اسم، بريد، دور، كلمة مرور مؤقتة)، تغيير الدور، تعطيل دون حذف (FR-03) |
| المشاريع | إنشاء وتعديل، الحالة (نشط/متوقف/مكتمل/مؤرشف)، نسبة إنجاز تلقائية، الأرشفة بدل الحذف (FR-05–07) |
| المهام | إسناد لعضو أو عدة أعضاء أو "كل أعضاء المشروع"، حالة مشتركة للمهمة الجماعية، الأولويات، المسار جديدة ← قيد التنفيذ ← قيد المراجعة ← مكتملة (FR-08–11) |
| العرض | كانبان بالسحب والإفلات، قائمة مع فرز وتصفية، صفحة "مهامي"، تمييز المتأخر بالأحمر (FR-15–17، FR-25) |
| التعاون | تعليقات مع الإشارة @، سجل نشاط لكل مهمة (FR-19، FR-21) |
| الإشعارات | فورية داخل التطبيق: إسناد، إشارة، تعليق، تغيير حالة، استحقاق الغد (FR-22) |
| المتابعة | لوحة رئيسية: المهام حسب الحالة، المتأخرة مرتبة بأيام التأخر، المستحقة هذا الأسبوع، إنجاز المشاريع، حمل العمل لكل عضو (FR-24) |
| اللغة | عربية (RTL) وإنجليزية مع التبديل وحفظ التفضيل (FR-28) |

متطلبات S وC (المرفقات، المجموعات المحفوظة، المهام الفرعية في الواجهة، التقارير CSV/PDF، البحث العام، التقويم، الوسوم، التذكير بالبريد) مخطط لها في v1.1 وv1.2. جداولها موجودة في قاعدة البيانات من الآن.

## البنية

```
src/
  pages/            الدخول، اللوحة، المشاريع، كانبان/قائمة، مهامي، المستخدمون، الملف الشخصي
  components/       المكوّنات المشتركة ونوافذ المهام والإشعارات
  lib/logic.js      قواعد العمل (مختبرة 100%)
  lib/api.js        الوصول للبيانات (كل الطلبات تمر عبر RLS)
  i18n/             ar.json و en.json
supabase/
  migrations/001_tables.sql   الجداول والمشغّلات (Triggers) وقواعد العمل
  migrations/002_rls.sql      سياسات الصلاحيات على مستوى الصفوف
  migrations/003_cron.sql     إشعار "تستحق غداً" يومياً (pg_cron)
  seed.sql                    ترقية أول حساب إلى مدير نظام
  functions/create-user/      Edge Function لإنشاء الحسابات (تحمل مفتاح الخدمة)
tests/
  logic.test.js     اختبارات قواعد العمل (Vitest)
  sql/              اختبارات الصلاحيات لكل دور على PostgreSQL حقيقي
.github/workflows/  ci.yml · deploy.yml · backup.yml
```

**الحماية في قاعدة البيانات لا في المتصفح:** كل جدول عليه RLS، والمشغّلات تفرض قواعد العمل:
- العضو يغيّر حالة المهام المسندة إليه فقط، ولا يعدّل غيرها من الحقول.
- لا يُسند أحد إلى مهمة خارج مشروعه أو بحساب معطّل.
- المشروع لا يُحذف، والحساب المعطّل لا يرى شيئاً.
- إزالة عضو من مشروع تزيله من مهامه المفتوحة وتنبّه مدير المشروع.
- `completed_at` و`completed_by` وسجل النشاط والإشعارات تُكتب تلقائياً.

## التثبيت (≈30 دقيقة)

### 1) Supabase

1. أنشئ مشروعاً من [supabase.com](https://supabase.com). يكفي أقرب منطقة متاحة.
2. من **SQL Editor** شغّل الملفات بالترتيب:
   - `supabase/migrations/001_tables.sql`
   - `supabase/migrations/002_rls.sql`
   - `supabase/migrations/003_cron.sql`: فعّل أولاً امتداد **pg_cron** من Database → Extensions.
3. من **Authentication → Sign In / Providers**:
   - أوقف **Allow new users to sign up**، فالحسابات ينشئها المدير فقط.
   - اضبط الحد الأدنى لطول كلمة المرور على 8.
4. من **Authentication → URL Configuration**:
   - **Site URL**: رابط GitHub Pages، مثل `https://<user>.github.io/project-tracker-/`
   - أضف الرابط نفسه في **Redirect URLs**، فهو مطلوب لروابط استعادة كلمة المرور.
5. **أول مدير نظام:** من Authentication → Users → *Add user* أنشئ حسابك (فعّل *Auto Confirm User*)، ثم عدّل البريد في `supabase/seed.sql` وشغّله في SQL Editor.
6. **Edge Function لإنشاء الحسابات:**
   ```bash
   npx supabase login
   npx supabase functions deploy create-user --project-ref <project-ref>
   ```
   أو من لوحة Supabase: Edge Functions → *Deploy a new function* باسم `create-user`، والصق محتوى `supabase/functions/create-user/index.ts`.
   اختياري لتقييد الطلبات على موقعك فقط: `npx supabase secrets set ALLOWED_ORIGIN=https://<user>.github.io`
7. **البريد:** خادم البريد المدمج في Supabase محدود بعدد قليل من الرسائل في الساعة. للاستخدام الفعلي اضبط SMTP خاصاً من Authentication → Emails → SMTP Settings.

> ⚠️ مفتاح `service_role` لا يوضع أبداً في الواجهة ولا في GitHub. يكفي التطبيق **المفتاح العام (anon)**.

### 2) GitHub

1. **Settings → Secrets and variables → Actions** وأضف:
   - `SUPABASE_URL`: من Supabase → Project Settings → API
   - `SUPABASE_ANON_KEY`: المفتاح العام (anon / publishable)
2. **Settings → Pages → Source:** اختر *GitHub Actions*.
3. أي دمج في `main` يبني التطبيق وينشره تلقائياً عبر `deploy.yml`.
4. للنسخ الاحتياطي الأسبوعي (`backup.yml`): أنشئ مستودعاً **خاصاً** للنسخ، وأضف الأسرار `SUPABASE_DB_URL` و`BACKUP_REPO` و`BACKUP_TOKEN`. التفاصيل داخل الملف. المهمة نفسها "تلمس" القاعدة كل 3 أيام حتى لا يتوقف المشروع المجاني.
5. ممارسات موصى بها: حماية فرع `main` مع مراجعة لكل Pull Request، وتفعيل **Secret scanning** و**Push protection**.

### إذا كانت الشبكة تحجب `supabase.co`

بعض الشبكات ومزودي الإنترنت يحجبون نطاق `*.supabase.co`، فيظهر في المتصفح `DNS_PROBE_FINISHED_NO_INTERNET` أو "تعذّر الاتصال بالخادم". الحل وسيط مجاني على Cloudflare Workers، والتطبيق يتصل عن طريقه:

1. أنشئ حساباً مجانياً في [Cloudflare](https://dash.cloudflare.com/sign-up)، ثم **Workers & Pages ← Create ← Create Worker** (قالب Hello World) ← **Deploy**.
2. اضغط **Edit code**، والصق محتوى [`cloudflare/supabase-proxy.js`](cloudflare/supabase-proxy.js) بدل الكود الافتراضي، ثم **Deploy**. غيّر `SUPABASE_URL` في أول الملف إذا كان مشروعك مختلفاً.
3. انسخ رابط الـ Worker، مثل `https://supabase-proxy.<حسابك>.workers.dev`، وافتح `<الرابط>/auth/v1/health`. لازم يظهر رد JSON.
4. في GitHub غيّر قيمة السر `SUPABASE_URL` إلى رابط الـ Worker، وأعد تشغيل **Deploy to GitHub Pages**.
5. **رسالة استعادة كلمة المرور:** رابطها الافتراضي يمر على `supabase.co`. من Supabase ← **Authentication ← Emails ← Reset Password** استبدل `{{ .ConfirmationURL }}` بـ:
   ```
   {{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery
   ```
   بهذا يفتح الرابط التطبيقَ مباشرة، ويتحقق التطبيق من الرمز عبر الوسيط.

لوحة Supabase (`supabase.com`) ووظيفة `create-user` لا تتأثران، لأنهما تعملان من جهة الخادم.

### 3) التطوير المحلي

```bash
cp .env.example .env.local     # ضع SUPABASE_URL و ANON_KEY
npm install
npm run dev                    # http://localhost:5173
```

إذا كان `localhost` سيُستخدم لاستعادة كلمة المرور، أضف `http://localhost:5173` إلى Redirect URLs.

## الاختبارات

```bash
npm test                 # قواعد العمل (Vitest)
npm run test:coverage    # مع نسبة التغطية (الحد الأدنى 60%)
npm run test:sql         # الصلاحيات (RLS) والمشغّلات على PostgreSQL
```

`test:sql` يحتاج خادم PostgreSQL ومتغيرات `PGHOST` و`PGUSER` و`PGPASSWORD`. ينشئ قاعدة مؤقتة ويحاكي ما يلزم من Supabase (`auth.uid()` والأدوار)، ثم يشغّل أكثر من 50 فحصاً لكل دور. يشغّلها `ci.yml` تلقائياً مع كل Pull Request.

## ملاحظات وحدود معروفة

- **القفل بعد 5 محاولات** يعمل على مستوى التطبيق (دوال `login_lock_status` و`register_login_failure`)، وتضاف إليه حدود المعدل المدمجة في Supabase Auth. يمكن لأي شخص يعرف بريداً أن يقفله مؤقتاً لـ15 دقيقة. هذه مقايضة مقبولة لفريق داخلي.
- **الخروج بعد 8 ساعات خمول** يُطبَّق في المتصفح. ويمكن أيضاً ضبط *Time-box / Inactivity timeout* للجلسات من إعدادات Supabase في الخطط المدفوعة.
- **رابط استعادة كلمة المرور** بالقالب الافتراضي يجب فتحه في المتصفح نفسه الذي طُلب منه (تدفق PKCE). القالب المعدّل في قسم "الشبكة تحجب supabase.co" يعمل من أي متصفح.
- يستخدم التطبيق `HashRouter` (روابط مثل `#/projects`) لأن GitHub Pages لا يدعم التوجيه من جهة الخادم.

## الترخيص

[MIT](LICENSE)

</div>
