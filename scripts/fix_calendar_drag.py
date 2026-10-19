from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="""  window.dropAppointment=function(date,time,ev){
    ev?.preventDefault();const aid=draggedAppointmentId||ev?.dataTransfer?.getData('text/plain');draggedAppointmentId=null;const a=db.appointments.find(x=>x.id===aid);if(!a)return;
    if(billed(a)||db.records.some(r=>r.appointment===aid&&!r.draft))return toast('Atendimento fechado ou com registro clínico não pode ser movido.');
    if(appointmentConflict(a.pro,date,time,a.duration,a.id))return toast('Há conflito de horário para este profissional.');
    if(timeMinutes(time)+Number(a.duration)>1440)return toast('O atendimento deve terminar no mesmo dia.');
    a.history=a.history||[];a.history.push(`${new Date().toLocaleString('pt-BR')}: movido por arrastar de ${a.date} ${a.time} para ${date} ${time}`);a.date=date;a.time=time;a.status=a.status==='Agendado'?'Remarcado':a.status;save();render();toast('Atendimento movido na agenda.');
  };
"""
new=old+"""
  window.dropAppointmentToDay=function(date,ev){
    ev?.preventDefault();
    const aid=draggedAppointmentId||ev?.dataTransfer?.getData('text/plain');
    const a=db.appointments.find(x=>x.id===aid);if(!a){draggedAppointmentId=null;return}
    if(billed(a)||db.records.some(r=>r.appointment===aid&&!r.draft)){draggedAppointmentId=null;return toast('Atendimento fechado ou com registro clínico não pode ser movido.');}
    let target=a.time;
    if(appointmentConflict(a.pro,date,target,a.duration,a.id)){
      const original=timeMinutes(a.time),duration=Number(a.duration)||60;
      const candidates=[];
      for(let m=7*60;m+duration<=22*60;m+=30) if(!appointmentConflict(a.pro,date,String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),duration,a.id)) candidates.push(m);
      if(!candidates.length){draggedAppointmentId=null;return toast('Não há horário livre para este profissional nesse dia.');}
      const best=candidates.sort((x,y)=>Math.abs(x-original)-Math.abs(y-original)||x-y)[0];
      target=String(Math.floor(best/60)).padStart(2,'0')+':'+String(best%60).padStart(2,'0');
    }
    draggedAppointmentId=null;
    const oldDate=a.date,oldTime=a.time;
    a.history=a.history||[];a.history.push(`${new Date().toLocaleString('pt-BR')}: movido no calendário de ${oldDate} ${oldTime} para ${date} ${target}`);
    a.date=date;a.time=target;a.status=a.status==='Agendado'?'Remarcado':a.status;save();render();
    toast(target===oldTime?'Atendimento movido para o novo dia.':`Atendimento movido para ${target}, próximo horário livre do profissional.`);
  };
"""
if old not in s: raise SystemExit('Bloco dropAppointment não encontrado; nada alterado')
s=s.replace(old,new,1)
old_drop="""ondrop=\"dropAppointment('${d}',(db.appointments.find(a=>a.id===(draggedAppointmentId||event.dataTransfer.getData('text/plain')))?.time||'08:00'),event)\""" 
new_drop="""ondrop=\"dropAppointmentToDay('${d}',event)\"""
if old_drop not in s: raise SystemExit('Drop do calendário mensal não encontrado; nada alterado')
s=s.replace(old_drop,new_drop,1)
p.write_text(s,encoding='utf-8')
print('Correção de arrastar no calendário aplicada')
