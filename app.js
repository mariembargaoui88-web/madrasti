(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.MADRASTI_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey &&
    cfg.supabaseUrl.startsWith("https://") &&
    !cfg.supabaseUrl.includes("PASTE_") && !cfg.supabaseAnonKey.includes("PASTE_");
  let client = null, session = null, signupMode = false, profileName = "";
  const status = $("lesson-status");
  const grid = $("lesson-grid");
  const toast = (msg) => { const t=$("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); };
  const gradeName = (n) => ({1:"السنة الأولى",2:"السنة الثانية",3:"السنة الثالثة",4:"السنة الرابعة",5:"السنة الخامسة",6:"السنة السادسة"}[n] || "ابتدائي");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const msg = (el, text, error=false) => { el.textContent=text; el.classList.toggle("error",error); };
  const show = (id) => $(id).classList.remove("hidden");
  const hide = (id) => $(id).classList.add("hidden");

  function renderLessons(items) {
    const q = $("search").value.trim().toLowerCase(), g=$("grade-filter").value, s=$("subject-filter").value;
    const filtered = items.filter(x => (!g || String(x.grade)===g) && (!s || x.subject===s) &&
      (!q || [x.title,x.description,x.subject,gradeName(x.grade)].join(" ").toLowerCase().includes(q)));
    grid.innerHTML = "";
    if (!filtered.length) {
      status.textContent = configured ? "لا توجد دروس منشورة تطابق البحث بعد." : "هذه نسخة جاهزة للربط. بعد إعداد قاعدة البيانات ونشر أول درس، سيظهر هنا.";
      return;
    }
    status.textContent = `عدد الدروس: ${filtered.length}`;
    filtered.forEach(x => {
      const card=document.createElement("article"); card.className="lesson-card";
      let resource = "";
      if (x.resource_url) resource=`<a class="resource-link" href="${esc(x.resource_url)}" target="_blank" rel="noopener">فتح المورد ↗</a>`;
      else if (x.storage_path && client) {
        const {data}=client.storage.from("lesson-files").getPublicUrl(x.storage_path);
        resource=`<a class="resource-link" href="${esc(data.publicUrl)}" target="_blank" rel="noopener">فتح المورد ↗</a>`;
      } else resource='<span class="teacher-name">لا يوجد ملف مرفق</span>';
      card.innerHTML=`<div class="card-top"><span class="tag">${esc(x.subject)}</span><span class="tag grade">${esc(gradeName(x.grade))}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.description || "مورد تعليمي لدعم التعلّم.")}</p><div class="card-bottom"><span class="teacher-name">${esc(x.teacher_name || "معلّم مدرستي")}</span>${resource}</div>`;
      grid.appendChild(card);
    });
  }

  async function loadLessons() {
    if (!configured) {
      status.textContent = "المشروع جاهز، لكن يلزم ربطه بقاعدة بيانات مجانية قبل عرض الدروس المشتركة.";
      renderLessons([]); return;
    }
    try {
      const {data,error}=await client.from("lessons").select("id,title,grade,subject,description,resource_url,storage_path,teacher_name,created_at").eq("published",true).order("created_at",{ascending:false});
      if(error) throw error;
      renderLessons(data || []);
    } catch(e) {
      status.textContent = "تعذّر تحميل الدروس. تأكدي من إعداد قاعدة البيانات وسياسات الوصول.";
      console.error(e);
    }
  }
  function updateAccountUI() {
    const root=$("account-actions");
    if(session) {
      root.innerHTML=`<button class="btn light" id="manage-open">فضاء المعلّم</button> <button class="btn light" id="logout">خروج</button>`;
      $("manage-open").onclick=openTeacher;
      $("logout").onclick=async()=>{if(client) await client.auth.signOut(); session=null; updateAccountUI(); toast("تم تسجيل الخروج");};
    } else {
      root.innerHTML='<button class="btn light" id="login-open">دخول المعلّم</button>';
      $("login-open").onclick=()=>{signupMode=false; updateAuthMode(); show("auth-modal");};
    }
  }
  function updateAuthMode() {
    $("auth-title").textContent=signupMode?"إنشاء حساب معلّم":"مرحبًا بعودتك";
    $("auth-submit").textContent=signupMode?"إنشاء الحساب":"تسجيل الدخول";
    $("auth-toggle").textContent=signupMode?"لديك حساب؟ سجّل الدخول":"إنشاء حساب جديد";
    $("name-wrap").classList.toggle("hidden",!signupMode);
    $("auth-password").autocomplete=signupMode?"new-password":"current-password";
    msg($("auth-message"),"");
  }
  $("login-open").onclick=()=>{signupMode=false;updateAuthMode();show("auth-modal");};
  $("auth-close").onclick=()=>hide("auth-modal");
  $("auth-toggle").onclick=()=>{signupMode=!signupMode;updateAuthMode();};
  $("auth-submit").onclick=async()=>{
    const email=$("auth-email").value.trim(), password=$("auth-password").value, name=$("auth-name").value.trim();
    if(!configured){msg($("auth-message"),"الخطوة التالية: أضيفي بيانات Supabase في ملف config.js أولًا.",true);return;}
    if(!email || password.length<6){msg($("auth-message"),"أدخلي بريدًا صحيحًا وكلمة مرور من 6 أحرف على الأقل.",true);return;}
    const b=$("auth-submit");b.disabled=true;
    try {
      let result;
      if(signupMode) result=await client.auth.signUp({email,password,options:{data:{full_name:name || "معلّم مدرستي"}}});
      else result=await client.auth.signInWithPassword({email,password});
      if(result.error) throw result.error;
      if(signupMode && !result.data.session) msg($("auth-message"),"تم إنشاء الحساب. افحصي بريدك لتأكيده ثم سجّلي الدخول.");
      else {session=result.data.session;profileName=result.data.user?.user_metadata?.full_name || name || "معلّم مدرستي";hide("auth-modal");updateAccountUI();openTeacher();toast("أهلًا بكِ في مدرستي");}
    } catch(e){msg($("auth-message"),e.message || "حدث خطأ، حاولي مجددًا.",true);}
    finally{b.disabled=false;}
  };

  async function openTeacher() {
    if(!session){show("auth-modal");return;}
    show("teacher-modal");await loadMyLessons();
  }
  $("teacher-close").onclick=()=>hide("teacher-modal");
  async function loadMyLessons(){
    const el=$("my-lessons");el.innerHTML="جارٍ تحميل دروسك…";
    if(!client){el.textContent="يجب إعداد قاعدة البيانات أولًا.";return;}
    const {data,error}=await client.from("lessons").select("id,title,grade,subject").eq("teacher_id",session.user.id).order("created_at",{ascending:false});
    if(error){el.textContent="تعذّر تحميل الدروس.";return;}
    if(!data?.length){el.textContent="لم تنشري أي درس بعد.";return;}
    el.innerHTML="";
    data.forEach(x=>{const row=document.createElement("div");row.className="my-lesson";row.innerHTML=`<span>${esc(x.title)} — ${esc(gradeName(x.grade))}</span><button class="delete-btn" data-id="${esc(x.id)}">حذف</button>`;row.querySelector("button").onclick=()=>deleteLesson(x.id);el.appendChild(row);});
  }
  async function deleteLesson(id){
    if(!confirm("هل تريدين حذف هذا الدرس؟"))return;
    const {error}=await client.from("lessons").delete().eq("id",id);
    if(error){toast("تعذّر حذف الدرس");return;}
    await loadMyLessons();await loadLessons();toast("تم حذف الدرس");
  }
  $("lesson-form").onsubmit=async(e)=>{
    e.preventDefault();
    if(!configured || !session){msg($("publish-message"),"يجب إعداد قاعدة البيانات وتسجيل الدخول أولًا.",true);return;}
    const btn=$("publish-button"), file=$("lesson-file").files[0], url=$("lesson-url").value.trim();
    if(!file && !url){msg($("publish-message"),"أضيفي ملفًا أو رابطًا للمورد.",true);return;}
    btn.disabled=true;msg($("publish-message"),"جارٍ نشر الدرس…");
    let storage_path=null;
    try{
      if(file){
        if(file.size>25*1024*1024) throw new Error("حجم الملف أكبر من 25 ميغابايت.");
        const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        storage_path=`${session.user.id}/${Date.now()}_${safe}`;
        const {error:upErr}=await client.storage.from("lesson-files").upload(storage_path,file,{upsert:false});
        if(upErr) throw upErr;
      }
      const {error}=await client.from("lessons").insert({
        title:$("lesson-title").value.trim(),grade:Number($("lesson-grade").value),
        subject:$("lesson-subject").value,description:$("lesson-description").value.trim(),
        resource_url:url||null,storage_path,teacher_id:session.user.id,
        teacher_name:profileName || session.user.user_metadata?.full_name || "معلّم مدرستي",published:true
      });
      if(error) throw error;
      $("lesson-form").reset();msg($("publish-message"),"نُشر الدرس بنجاح.");await loadMyLessons();await loadLessons();
    }catch(err){msg($("publish-message"),err.message||"حدث خطأ أثناء النشر.",true);}
    finally{btn.disabled=false;}
  };
  $("search").addEventListener("input",loadLessons);
  $("grade-filter").addEventListener("change",loadLessons);
  $("subject-filter").addEventListener("change",loadLessons);
  if(configured && window.supabase){
    client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
    client.auth.getSession().then(({data})=>{session=data.session;profileName=session?.user?.user_metadata?.full_name||"";updateAccountUI();});
    client.auth.onAuthStateChange((_event,s)=>{session=s;profileName=s?.user?.user_metadata?.full_name||"";updateAccountUI();});
  } else {
    updateAccountUI();
  }
  loadLessons();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(err => console.warn("PWA offline setup:", err)));
  }
})();