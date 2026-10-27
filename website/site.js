(() => {
 'use strict';
 const toggle=document.querySelector('.menu-toggle'),nav=document.getElementById('main-nav');
 function closeMenu(){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menu');nav.classList.remove('open');}
 toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');nav.classList.toggle('open',open);});
 nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
 document.addEventListener('click',e=>{if(!e.target.closest('.site-header'))closeMenu();});
 document.querySelectorAll('[data-dialog]').forEach(button=>button.addEventListener('click',()=>{const dialog=document.getElementById(button.dataset.dialog);dialog.showModal();document.body.classList.add('dialog-open');}));
 document.querySelectorAll('dialog.info-dialog').forEach(dialog=>{
  dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>document.body.classList.remove('dialog-open'));
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 });
 document.getElementById('year').textContent=new Date().getFullYear();
 const form=document.getElementById('contact-form'),feedback=document.getElementById('contact-feedback');
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const fields=new FormData(form),name=String(fields.get('name')||'').trim(),city=String(fields.get('city')||'').trim();
  if(!name||!city)return;
  const message=`Olá! Meu nome é ${name}. Vim pelo site da Olhan e procuro fisioterapia domiciliar para ${fields.get('for')}. Minha cidade e bairro: ${city}. Gostaria de conhecer o serviço e consultar a disponibilidade de uma avaliação.`;
  const url='https://wa.me/5519999132996?text='+encodeURIComponent(message);
  feedback.hidden=false;feedback.replaceChildren(document.createTextNode('Sua mensagem está pronta. Se o WhatsApp não abrir, '));
  const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='clique aqui para continuar.';link.style.textDecoration='underline';feedback.append(link);
  window.open(url,'_blank','noopener,noreferrer');
 });
})();

(() => {
 const track=document.getElementById('reviews-track');
 if(!track)return;
 const prev=document.querySelector('.review-prev'),next=document.querySelector('.review-next');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const update=()=>{prev.disabled=track.scrollLeft<2;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;};
 const move=direction=>track.scrollBy({left:direction*(track.querySelector('.review-card').getBoundingClientRect().width+24),behavior:reduced.matches?'instant':'smooth'});
 prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
 track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);window.addEventListener('load',update);update();
})();

(() => {
 const dialog=document.getElementById('review-dialog');if(!dialog)return;
 const content=dialog.querySelector('.review-dialog-content');
 document.querySelectorAll('.review-expand').forEach(button=>button.addEventListener('click',()=>{content.replaceChildren(button.querySelector('.review-crop').cloneNode(true));dialog.showModal();document.body.classList.add('dialog-open');}));
 dialog.querySelector('.review-dialog-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>document.body.classList.remove('dialog-open'));
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
})();
