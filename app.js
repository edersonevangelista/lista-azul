import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CONFIG = window.LISTA_AZUL_CONFIG || {};
const $ = (s) => document.querySelector(s);
const DEFAULT_PRODUCTS = [
  ["arroz","Arroz"],["feijao","Feijão"],["acucar","Açúcar"],["leite-em-po","Leite em pó"],
  ["queijo-mussarela","Queijo Mussarela"],["manteiga","Manteiga"],["banana","Banana"],
  ["uva","Uva"],["mexerica","Mexerica"],["ajax","Ajax"],["detergente","Detergente"],
  ["sabao-em-po","Sabão em pó"],["agua-sanitaria","Água sanitária"]
].map(([id,name]) => ({id,name}));

const authView = $("#auth-view"), appView = $("#app-view");
const authForm = $("#auth-form"), authMessage = $("#auth-message");
const authTitle = $("#auth-title"), authSubmit = $("#auth-submit"), toggleAuth = $("#toggle-auth");
const logoutButton = $("#logout-button"), syncStatus = $("#sync-status");
const panels = {toBuy:$("#panel-toBuy"),inCart:$("#panel-inCart"),catalog:$("#panel-catalog")};
const navItems = [...document.querySelectorAll(".nav-item")];
const toast = $("#toast"), dialog = $("#confirm-dialog");
let supabase = null, user = null, householdId = null, state = null, currentTab = "toBuy";
let realtimeChannel = null, toastTimer = null, isSignUp = false, writeQueue = Promise.resolve();

function showToast(message) {
  toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function setSync(message, online=false) {
  syncStatus.lastChild.textContent = message;
  syncStatus.querySelector(".status-dot").classList.toggle("online", online);
}
function setAuthMessage(message, error=true) {
  authMessage.textContent = message;
  authMessage.style.color = error ? "#A32D2D" : "#16794B";
}
function validateConfig() {
  return CONFIG.supabaseUrl && CONFIG.supabaseAnonKey &&
    !CONFIG.supabaseUrl.includes("COLE_AQUI") && !CONFIG.supabaseAnonKey.includes("COLE_AQUI");
}
function showAuth() {
  authView.hidden = false; appView.hidden = true; logoutButton.hidden = true;
}
function showApp() {
  authView.hidden = true; appView.hidden = false; logoutButton.hidden = false;
}
function switchTab(tab) {
  if (!panels[tab]) return;
  currentTab = tab;
  Object.entries(panels).forEach(([key,el]) => el.hidden = key !== tab);
  navItems.forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    active ? btn.setAttribute("aria-current","page") : btn.removeAttribute("aria-current");
  });
  window.scrollTo({top:0,behavior:"smooth"});
}
function makeButton(label, cls, aria, action, disabled=false) {
  const b=document.createElement("button"); b.type="button"; b.className=cls; b.textContent=label;
  b.setAttribute("aria-label",aria); b.disabled=disabled; b.addEventListener("click",action); return b;
}
function row(product, button) {
  const li=document.createElement("li"); li.className="product-row";
  const name=document.createElement("span"); name.className="product-name"; name.textContent=product.name;
  li.append(name,button); return li;
}
function active(id) {
  return state.toBuy.some(p=>p.id===id) || state.inCart.some(p=>p.id===id);
}
function render() {
  if (!state) return;
  const toBuyList=$("#toBuy-list"), cartList=$("#inCart-list"), catalogList=$("#catalog-list");
  toBuyList.replaceChildren(); cartList.replaceChildren(); catalogList.replaceChildren();
  state.toBuy.forEach(p => toBuyList.append(row(p,makeButton("✓","check-button",`Marcar ${p.name} como pego`,()=>moveToCart(p.id)))));
  state.inCart.forEach(p => {
    const r=row(p,makeButton("Devolver","return-button",`Devolver ${p.name}`,()=>returnToBuy(p.id)));
    cartList.append(r);
  });
  state.catalog.forEach(p => {
    const exists=active(p.id);
    catalogList.append(row(p,makeButton(exists?"✓":"+","add-button",exists?`${p.name} já está em uma lista ativa`:`Adicionar ${p.name}`,()=>addToBuy(p.id),exists)));
  });
  $("#toBuy-count").textContent=state.toBuy.length;
  $("#inCart-count").textContent=state.inCart.length;
  $("#catalog-count").textContent=state.catalog.length;
  $("#toBuy-empty").hidden=state.toBuy.length>0;
  $("#inCart-empty").hidden=state.inCart.length>0;
  $("#finish-area").hidden=state.inCart.length===0;
  $("#finish-button").disabled=state.inCart.length===0;
  switchTab(currentTab);
}
function normalize(s) {
  if (!s || !Array.isArray(s.catalog) || !Array.isArray(s.toBuy) || !Array.isArray(s.inCart)) return null;
  const catalog=s.catalog.filter(p=>p && typeof p.id==="string" && typeof p.name==="string");
  const ids=new Set(catalog.map(p=>p.id)), seen=new Set();
  const clean=list=>list.filter(p=>{
    if (!p || !ids.has(p.id) || seen.has(p.id)) return false;
    seen.add(p.id); return true;
  }).map(p=>({...catalog.find(c=>c.id===p.id)}));
  return {catalog:catalog.map(p=>({id:p.id,name:p.name})),toBuy:clean(s.toBuy),inCart:clean(s.inCart)};
}
async function loadSharedState() {
  setSync("Carregando lista compartilhada…");
  const {data,error}=await supabase.from("shared_lists").select("state").eq("household_id",householdId).maybeSingle();
  if (error) throw error;
  if (!data) {
    const initial={catalog:DEFAULT_PRODUCTS,toBuy:[],inCart:[]};
    const {error:insertError}=await supabase.from("shared_lists").insert({household_id:householdId,state:initial});
    if (insertError && insertError.code!=="23505") throw insertError;
    const {data:retry,error:retryError}=await supabase.from("shared_lists").select("state").eq("household_id",householdId).single();
    if (retryError) throw retryError;
    state=normalize(retry.state) || initial;
  } else state=normalize(data.state) || {catalog:DEFAULT_PRODUCTS,toBuy:[],inCart:[]};
  render(); setSync("Lista compartilhada sincronizada",true); subscribeRealtime();
}
async function saveSharedState() {
  const snapshot=JSON.parse(JSON.stringify(state));
  writeQueue=writeQueue.then(async()=>{
    setSync("Salvando alterações…");
    const {error}=await supabase.from("shared_lists").update({state:snapshot,updated_at:new Date().toISOString()}).eq("household_id",householdId);
    if (error) { setSync("Falha ao sincronizar. Verifique a conexão."); showToast("Não foi possível sincronizar a alteração."); throw error; }
    setSync("Lista compartilhada sincronizada",true);
  }).catch(()=>{});
  return writeQueue;
}
function subscribeRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel=supabase.channel(`shared-list-${householdId}`)
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"shared_lists",filter:`household_id=eq.${householdId}`},payload=>{
      if (payload.new?.state) { state=normalize(payload.new.state) || state; render(); setSync("Lista atualizada em outro dispositivo",true); }
    }).subscribe();
}
async function mutate(action, success) {
  const before=JSON.parse(JSON.stringify(state));
  action(); render();
  try { await saveSharedState(); if(success) showToast(success); }
  catch (_) { state=before; render(); }
}
function addToBuy(id) {
  const p=state.catalog.find(x=>x.id===id); if(!p) return;
  if(active(id)) { showToast(`${p.name} já está em uma lista ativa.`); return; }
  mutate(()=>state.toBuy.push({...p}),`${p.name} adicionado à lista.`);
}
function moveToCart(id) {
  const i=state.toBuy.findIndex(p=>p.id===id); if(i<0)return;
  mutate(()=>{const [p]=state.toBuy.splice(i,1);if(!state.inCart.some(x=>x.id===id))state.inCart.push(p);},`${state.catalog.find(p=>p.id===id)?.name || "Produto"} foi para No Carrinho.`);
}
function returnToBuy(id) {
  const i=state.inCart.findIndex(p=>p.id===id); if(i<0)return;
  mutate(()=>{const [p]=state.inCart.splice(i,1);if(!state.toBuy.some(x=>x.id===id))state.toBuy.push(p);},`${state.catalog.find(p=>p.id===id)?.name || "Produto"} voltou para Itens a Comprar.`);
}
function finishPurchase() {
  if(!state || state.inCart.length===0)return;
  mutate(()=>{state.toBuy=[];state.inCart=[];},"Compra concluída! Cadastro preservado.");
  switchTab("toBuy");
}
async function startSession(sessionUser) {
  user=sessionUser;
  const {data:membership,error}=await supabase.from("household_members").select("household_id").eq("user_id",user.id).maybeSingle();
  if(error) throw error;
  if(!membership) {
    showAuth(); setAuthMessage("Sua conta foi criada, mas ainda não foi vinculada à lista compartilhada. Siga o README para adicionar os dois usuários como membros.",true);
    return;
  }
  householdId=membership.household_id;
  showApp(); await loadSharedState();
}
async function boot() {
  if(!validateConfig()) {
    showAuth(); setAuthMessage("Antes de entrar, configure a URL e a chave pública do Supabase no arquivo config.js.",true);
    $("#auth-submit").disabled=true; toggleAuth.disabled=true; return;
  }
  supabase=createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey);
  const {data:{session}}=await supabase.auth.getSession();
  if(session) {
    try { await startSession(session.user); } catch(e) { setAuthMessage(`Não foi possível abrir a lista: ${e.message}`); }
  } else showAuth();
  supabase.auth.onAuthStateChange((event,session)=>{
    if(event==="SIGNED_OUT") { if(realtimeChannel)supabase.removeChannel(realtimeChannel);user=null;state=null;householdId=null;showAuth(); }
  });
}
toggleAuth.addEventListener("click",()=>{
  isSignUp=!isSignUp;
  authTitle.textContent=isSignUp?"Criar sua conta":"Entrar na sua conta";
  authSubmit.textContent=isSignUp?"Criar conta":"Entrar";
  toggleAuth.textContent=isSignUp?"Já tem conta? Entrar":"Ainda não tem conta? Criar conta";
  $("#password").autocomplete=isSignUp?"new-password":"current-password";
  setAuthMessage("",false);
});
authForm.addEventListener("submit",async event=>{
  event.preventDefault(); if(!supabase)return;
  authSubmit.disabled=true; setAuthMessage("Aguarde…",false);
  const email=$("#email").value.trim(), password=$("#password").value;
  try {
    if(isSignUp) {
      const {data,error}=await supabase.auth.signUp({email,password});
      if(error)throw error;
      if(data.session) { await startSession(data.user); setAuthMessage("",false); }
      else setAuthMessage("Conta criada. Confira seu e-mail para confirmar e depois entre. Em seguida, o administrador precisa vincular sua conta à lista.",false);
    } else {
      const {data,error}=await supabase.auth.signInWithPassword({email,password});
      if(error)throw error;
      await startSession(data.user);
      if(householdId) setAuthMessage("",false);
    }
  } catch(error) { setAuthMessage(error.message || "Não foi possível autenticar."); }
  finally { authSubmit.disabled=false; }
});
logoutButton.addEventListener("click",async()=>{if(supabase)await supabase.auth.signOut();});
navItems.forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.tab)));
document.querySelectorAll("[data-go-tab]").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.goTab)));
$("#finish-button").addEventListener("click",()=>{if(state?.inCart.length && dialog.showModal)dialog.showModal();});
$("#cancel-finish").addEventListener("click",()=>dialog.close());
$("#confirm-finish").addEventListener("click",()=>{dialog.close();finishPurchase();});
dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
boot().catch(e=>setAuthMessage(`Erro de inicialização: ${e.message}`));

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
