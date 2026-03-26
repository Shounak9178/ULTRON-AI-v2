/**
 * agents/groq-agent.js
 * Ultron AI — Comprehensive error-free code generation
 * Covers ALL MATLAB engineering domains
 */
console.log("Current directory:", __dirname);
const fs = require("fs");
console.log("Files here:", fs.readdirSync(__dirname));

const path = require("path");

const https  = require('https');
const config = require('../config');

function detectSoftware(query) {
  const q = query.toLowerCase();
  const blenderKW = [
    'blender','3d model','3d design','mesh','render','animation','material','texture',
    'gear','bracket','bearing','shaft','spring','turbine','blade','piston','robot arm',
    'assembly','building','extrude','boolean','bevel','model a','design a','create a',
    'build a','bolt','nut','flange','housing','enclosure','chassis','propeller','wheel',
    'wing','pipe','valve','cam','crankshaft','suspension','3d print',
  ];
  const kicadKW = [
    'kicad','circuit','schematic','pcb','pcb layout','pcb design','netlist',
    'resistor','capacitor','inductor','transistor','op-amp','amplifier',
    '555 timer','555','power supply','rectifier','voltage divider','led circuit',
    'diode','mosfet','bjt','logic gate','flip flop','oscillator','comparator',
    'adc','dac','microcontroller','arduino','esp32','stm32','motor driver',
    'h-bridge','relay','transformer','electronic','electronics','soldering',
    'breadboard','component','voltage regulator','lm317','ne555','lm741',
    'filter circuit','rc filter','rlc','bandpass','notch filter','sensor circuit',
    'i2c','spi','uart','communication circuit','wireless','rf circuit',
  ];

  const matlabKW = [
    'matlab','simulate','simulation','plot','graph','signal','control','pid','bode',
    'fft','filter','ode','differential','matrix','analysis','heat','thermal','structural',
    'beam','stress','strain','vibration','frequency','spectrum','kinematics','dynamics',
    'power system','electrical','circuit','image processing','machine learning','regression',
    'statistics','optimization','calculate','compute','transfer function','fourier','wavelet',
    'kalman','monte carlo','finite element','fea','eigenvalue','stability','root locus',
    'state space','sampling','convolution','sensor fusion','lorenz','pendulum','rocket',
    'projectile','fluid','pressure','temperature','voltage','current','power','energy',
  ];
  let bs=0, ms=0, ks=0;
  blenderKW.forEach(k=>{if(q.includes(k))bs++;});
  matlabKW.forEach(k=>{if(q.includes(k))ms++;});
  kicadKW.forEach(k=>{if(q.includes(k))ks++;});
  if(ks>bs && ks>ms) return 'kicad';
  if(bs>ms && bs>ks) return 'blender';
  if(ms>bs && ms>ks) return 'matlab';
  if(/\b(gear|shaft|bracket|bearing|bolt|spring|arm|blade|wheel|pipe|piston)\b/.test(q)) return 'blender';
  if(/\b(circuit|schematic|pcb|resistor|capacitor|voltage|power supply|amplifier|555)\b/.test(q)) return 'kicad';
  return 'matlab';
}

function callGemini(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const key=config.GEMINI_API_KEY, model=config.GEMINI_MODEL||'gemini-2.0-flash';
    if(!key||key==='YOUR_GEMINI_API_KEY_HERE') return reject(new Error('NO_GEMINI_KEY'));
    const body=JSON.stringify({
      contents:[{parts:[{text:systemPrompt+'\n\n'+userMessage}]}],
      generationConfig:{maxOutputTokens:config.MAX_TOKENS||8192,temperature:0.1},
    });
    const req=https.request({
      hostname:'generativelanguage.googleapis.com',
      path:`/v1beta/models/${model}:generateContent?key=${key}`,
      method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
    },res=>{
      let data=''; res.on('data',c=>{data+=c;});
      res.on('end',()=>{
        try{
          const p=JSON.parse(data);
          if(p.error) return reject(new Error(`Gemini: ${p.error.message}`));
          const text=p?.candidates?.[0]?.content?.parts?.[0]?.text;
          if(!text) return reject(new Error('Empty Gemini response'));
          resolve(text);
        }catch(e){reject(new Error(`Gemini parse: ${e.message}`));}
      });
    });
    req.on('error',e=>reject(new Error(`Network: ${e.message}`)));
    req.setTimeout(120000,()=>{req.destroy();reject(new Error('Gemini timeout'));});
    req.write(body); req.end();
  });
}

function callGroq(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const key=config.GROQ_API_KEY, model=config.GROQ_MODEL||'llama-3.3-70b-versatile';
    if(!key||key==='YOUR_GROQ_API_KEY_HERE') return reject(new Error('NO_GROQ_KEY'));
    const body=JSON.stringify({
      model, messages:[{role:'system',content:systemPrompt},{role:'user',content:userMessage}],
      max_tokens:config.MAX_TOKENS||8000, temperature:0.1, stream:false,
    });
    const req=https.request({
      hostname:'api.groq.com', path:'/openai/v1/chat/completions', method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`,'Content-Length':Buffer.byteLength(body)},
    },res=>{
      let data=''; res.on('data',c=>{data+=c;});
      res.on('end',()=>{
        try{
          const p=JSON.parse(data);
          if(p.error) return reject(new Error(`Groq: ${p.error.message}`));
          const text=p?.choices?.[0]?.message?.content;
          if(!text) return reject(new Error('Empty Groq response'));
          resolve(text);
        }catch(e){reject(new Error(`Groq parse: ${e.message}`));}
      });
    });
    req.on('error',e=>reject(new Error(`Network: ${e.message}`)));
    req.setTimeout(90000,()=>{req.destroy();reject(new Error('Groq timeout'));});
    req.write(body); req.end();
  });
}

async function callAI(systemPrompt, userMessage) {
  const gk=config.GEMINI_API_KEY, qk=config.GROQ_API_KEY;
  if(gk&&gk!=='YOUR_GEMINI_API_KEY_HERE'){
    try{ console.log('[ai] Gemini...'); const r=await callGemini(systemPrompt,userMessage); console.log('[ai] Gemini OK'); return r; }
    catch(e){ console.log(`[ai] Gemini failed: ${e.message}`); }
  }
  if(qk&&qk!=='YOUR_GROQ_API_KEY_HERE'){
    console.log('[ai] Groq...'); const r=await callGroq(systemPrompt,userMessage); console.log('[ai] Groq OK'); return r;
  }
  throw new Error('No API key. Add GEMINI_API_KEY or GROQ_API_KEY in config.js');
}

function parseJSON(text) {
  console.log('[parser]', text.slice(0,100).replace(/\n/g,' '));
  let clean=text.replace(/```json\n?/gi,'').replace(/```python\n?/gi,'').replace(/```matlab\n?/gi,'').replace(/```\n?/g,'').trim();
  try{const p=JSON.parse(clean);if(p&&p.steps)return p;}catch{}
  const f=clean.indexOf('{'),l=clean.lastIndexOf('}');
  if(f!==-1&&l>f){
    const sl=clean.slice(f,l+1);
    try{const p=JSON.parse(sl);if(p&&p.steps)return p;}catch{}
    const fx=sl.replace(/,(\s*[}\]])/g,'$1').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'');
    try{const p=JSON.parse(fx);if(p&&p.steps)return p;}catch{}
  }
  const si=clean.indexOf('"steps"');
  if(si!==-1){
    const as=clean.indexOf('[',si);let depth=0,ae=-1;
    for(let i=as;i<clean.length;i++){if(clean[i]==='[')depth++;else if(clean[i]===']'){depth--;if(depth===0){ae=i;break;}}}
    if(as!==-1&&ae!==-1){
      try{
        const steps=JSON.parse(clean.slice(as,ae+1));
        if(Array.isArray(steps)&&steps.length>0){
          const tm=clean.match(/"title"\s*:\s*"([^"]+)"/);
          return{title:tm?tm[1]:'Project',description:'',estimatedTime:'15s',software:'matlab',matlabToolboxes:['base'],steps};
        }
      }catch{}
    }
  }
  console.log('[parser] FAILED:\n',text.slice(0,500));
  throw new Error('Could not parse AI response. Please try again.');
}

function cleanSteps(steps) {
  return(steps||[]).map(s=>({...s,cmd:(s.cmd||'').replace(/\\n/g,'\n').replace(/\\t/g,'    ').trim()})).filter(s=>s.cmd&&s.cmd.length>5);
}

// ═══════════════════════════════════════════════════════════════════════
//  COMPREHENSIVE MATLAB SYSTEM PROMPT
//  Covers every engineering domain with exact tested patterns
// ═══════════════════════════════════════════════════════════════════════
const MATLAB_SYSTEM = `You are a world-class MATLAB R2025a expert. Generate complete accurate engineering projects.
Return ONLY a raw JSON object. No markdown. No explanation. Start with { end with }

JSON FORMAT:
{
  "title": "string",
  "description": "string",
  "estimatedTime": "string",
  "software": "matlab",
  "matlabToolboxes": ["base"],
  "steps": [{"label": "string", "cmd": "line1\\nline2\\nline3", "produces": "string"}]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOLDEN RULES — NEVER BREAK THESE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
G1. FORBIDDEN functions (need paid toolbox — never use):
    tf() ss() bode() step() rlocus() butter() filtfilt() feedback()
    margin() zpk() freqz() designfilt() fitctree() fitrensemble() svmtrain()

G2. First step always: clear; clc; close all;

G3. Element-wise operators ALWAYS on arrays:
    USE: .* ./ .^    NEVER: * / ^ on arrays

G4. plot(x,y) — x and y must be EXACT same size

G5. Strings use SINGLE quotes: title('text') xlabel('x')

G6. Every figure must have: figure(); [plot]; title(); xlabel(); ylabel(); grid on;

G7. Semicolons at end of EVERY computation line

G8. Indices start at 1 not 0. Comments use % not #

G9. No semicolon after end: write end not end;

G10. fprintf('text\\n') for output — format: fprintf('val=%.4f\\n', x);

G11. Preallocate before loops: y=zeros(1,N); then fill y(k)=...

G12. linspace always 3 args: x=linspace(a,b,N);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOMAIN PATTERNS — USE THESE EXACT TEMPLATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[CONTROL SYSTEMS — NO TOOLBOX]
Frequency response and Bode plot:
  w = logspace(-2, 4, 2000);          % frequency axis — never use s=-10:10
  s = 1j * w;                          % s = jw for frequency domain
  G = K ./ (J.*s.^2 + b.*s + K);      % transfer function evaluated at jw
  mag_dB    = 20*log10(abs(G));        % magnitude in dB
  phase_deg = angle(G) * 180/pi;      % phase in degrees
  figure('Name','Bode');
  subplot(2,1,1); semilogx(w, mag_dB, 'b-','LineWidth',2);
  title('Bode - Magnitude'); xlabel('Frequency (rad/s)'); ylabel('dB'); grid on;
  subplot(2,1,2); semilogx(w, phase_deg, 'r-','LineWidth',2);
  title('Bode - Phase'); xlabel('Frequency (rad/s)'); ylabel('Degrees'); grid on;

PID controller discrete simulation:
  Kp=10; Ki=2; Kd=1;
  tau=0.1; K_plant=1;   % plant: tau*dy/dt + y = K_plant*u
  dt=0.001; t=0:dt:10;
  r=ones(size(t)); y=zeros(size(t)); e_int=0; e_prev=0;
  for k=2:length(t)
      e=r(k)-y(k-1);
      e_int=e_int+e*dt;
      de=(e-e_prev)/dt;
      u=Kp*e+Ki*e_int+Kd*de;
      y(k)=y(k-1)+dt*(-y(k-1)+K_plant*u)/tau;
      e_prev=e;
  end
  figure('Name','PID');
  plot(t,r,'r--',t,y,'b-','LineWidth',2);
  title('PID Step Response'); xlabel('Time (s)'); ylabel('Output');
  legend('Reference','Output'); grid on;

State space (no ss() toolbox):
  A=[-b/J, -K/J; K/L, -R/L]; B=[0;1/L]; C=[1,0]; D=0;
  odefun=@(t,x) A*x + B*1;   % step input
  [t,x]=ode45(odefun,[0 5],[0;0]);
  y_out=(C*x')';
  figure('Name','State Space');
  plot(t,y_out,'b-','LineWidth',2);
  title('State Space Response'); xlabel('t(s)'); ylabel('Output'); grid on;

Root locus (manual):
  K_vals=linspace(0,200,1000);
  real_p=zeros(length(K_vals),2); imag_p=zeros(length(K_vals),2);
  for i=1:length(K_vals)
      p=roots([1, b/J+K_vals(i), K_vals(i)*K/J]);
      real_p(i,:)=real(p)'; imag_p(i,:)=imag(p)';
  end
  figure('Name','Root Locus');
  plot(real_p,imag_p,'b.','MarkerSize',2);
  title('Root Locus'); xlabel('Real'); ylabel('Imag'); grid on; axis equal;

[SIGNAL PROCESSING — NO TOOLBOX]
FFT spectrum:
  fs=1000; t=0:1/fs:1-1/fs; N=length(t);
  sig=0.8*sin(2*pi*50*t)+sin(2*pi*120*t)+0.2*randn(1,N);
  Y=fft(sig); P2=abs(Y/N);
  P1=P2(1:floor(N/2)+1); P1(2:end-1)=2*P1(2:end-1);
  f=fs*(0:floor(N/2))/N;
  figure('Name','FFT');
  subplot(2,1,1); plot(t(1:200),sig(1:200),'b-'); title('Time Domain'); xlabel('t(s)'); ylabel('Amp'); grid on;
  subplot(2,1,2); plot(f,P1,'r-','LineWidth',1.5); title('Spectrum'); xlabel('Hz'); ylabel('|P1|'); grid on;

Manual low-pass filter (moving average):
  wlen=20; sig_f=zeros(size(sig));
  for k=wlen:length(sig)
      sig_f(k)=mean(sig(k-wlen+1:k));
  end

Manual frequency response (no butter):
  fc=100; wc=2*pi*fc; w_hz=2*pi*f;
  H=1./sqrt(1+(w_hz./wc).^(2*4));  % 4th order Butterworth shape
  figure('Name','Filter');
  semilogx(f,20*log10(H+eps),'b-','LineWidth',2);
  title('Filter Response'); xlabel('Hz'); ylabel('dB'); grid on;

STFT / Spectrogram (manual):
  win=256; hop=128; Nfft=512;
  frames=floor((length(sig)-win)/hop)+1;
  S=zeros(Nfft/2+1,frames);
  for fr=1:frames
      idx=(fr-1)*hop+1:(fr-1)*hop+win;
      seg=sig(idx).*hanning(win)';
      F=fft(seg,Nfft); S(:,fr)=abs(F(1:Nfft/2+1));
  end
  figure('Name','Spectrogram');
  imagesc(S); colormap(jet); colorbar;
  title('Spectrogram'); xlabel('Frame'); ylabel('Frequency bin');

[ODE / DYNAMICS — ode45]
General ODE pattern:
  odefun=@(t,y)[y(2); f(t,y)];       % state: y(1)=position, y(2)=velocity
  [t,y]=ode45(odefun,[0 T],y0);
  pos=y(:,1); vel=y(:,2);             % extract states

Spring-mass-damper:
  m=1; k=4; c=0.5;
  odefun=@(t,y)[y(2); -(c/m)*y(2)-(k/m)*y(1)+sin(2*t)/m];
  [t,y]=ode45(odefun,[0 20],[0.5;0]);

Double pendulum:
  L1=1; L2=1; m1=1; m2=1; g=9.81;
  odefun=@(t,y) double_pend(t,y,L1,L2,m1,m2,g);
  [t,y]=ode45(odefun,[0 30],[pi/2;0;pi/4;0]);
  % define function after main script or as nested function

Lorenz attractor:
  sigma=10; rho=28; beta=8/3;
  lorenz=@(t,y)[sigma*(y(2)-y(1)); y(1)*(rho-y(3))-y(2); y(1)*y(2)-beta*y(3)];
  [t,y]=ode45(lorenz,[0 50],[1;1;1]);
  figure('Name','Lorenz');
  plot3(y(:,1),y(:,2),y(:,3),'b-','LineWidth',0.5);
  title('Lorenz Attractor'); xlabel('X'); ylabel('Y'); zlabel('Z'); grid on;

Projectile motion:
  g=9.81; v0=50; theta=45*pi/180;
  vx=v0*cos(theta); vy=v0*sin(theta);
  T=2*vy/g; t=linspace(0,T,1000);
  x=vx*t; y_proj=vy*t-0.5*g*t.^2;
  figure('Name','Projectile');
  plot(x,y_proj,'b-','LineWidth',2);
  title('Projectile Motion'); xlabel('x(m)'); ylabel('y(m)'); grid on;

[STRUCTURAL ANALYSIS]
Beam (simply supported, UDL):
  L=5; E=200e9; I=8.33e-6; w_load=1000;
  x=linspace(0,L,1000);
  Ra=w_load*L/2;
  V=Ra-w_load*x;
  M=Ra*x-w_load*x.^2/2;
  delta=(w_load*x./(24*E*I)).*(L^3-2*L*x.^2+x.^3)*1e3;
  figure('Name','Beam');
  subplot(3,1,1); plot(x,V/1e3,'b-','LineWidth',2); title('SFD (kN)'); xlabel('x(m)'); grid on;
  subplot(3,1,2); plot(x,M/1e3,'r-','LineWidth',2); title('BMD (kNm)'); xlabel('x(m)'); grid on;
  subplot(3,1,3); plot(x,-delta,'g-','LineWidth',2); title('Deflection (mm)'); xlabel('x(m)'); grid on;

Stress-strain:
  E_steel=200e9; sigma_y=250e6;
  eps=linspace(0,0.005,1000);
  sigma=zeros(size(eps));
  elastic=eps<=sigma_y/E_steel;
  sigma(elastic)=E_steel*eps(elastic);
  sigma(~elastic)=sigma_y;
  figure('Name','Stress-Strain');
  plot(eps*100,sigma/1e6,'b-','LineWidth',2);
  title('Stress-Strain Curve'); xlabel('Strain (%)'); ylabel('Stress (MPa)'); grid on;

2D Truss FEA (manual stiffness method):
  % Use direct stiffness assembly with node connectivity

[HEAT TRANSFER]
2D steady-state conduction:
  nx=50; ny=50; T=zeros(ny,nx);
  T(1,:)=100; T(end,:)=0; T(:,1)=50; T(:,end)=50;
  for iter=1:5000
      T(2:end-1,2:end-1)=0.25*(T(1:end-2,2:end-1)+T(3:end,2:end-1)+T(2:end-1,1:end-2)+T(2:end-1,3:end));
  end
  figure('Name','Heat');
  subplot(1,2,1); imagesc(T); colormap(hot); colorbar; title('Temperature'); set(gca,'YDir','normal');
  subplot(1,2,2); contourf(T,15); colormap(hot); colorbar; title('Isotherms');

Transient 1D:
  L=1; nx=50; dx=L/(nx-1); dt=0.0001; alpha=1e-4;
  x=linspace(0,L,nx); T_1d=sin(pi*x);
  T_new=T_1d;
  for n=1:500
      T_new(2:end-1)=T_1d(2:end-1)+alpha*dt/dx^2*(T_1d(3:end)-2*T_1d(2:end-1)+T_1d(1:end-2));
      T_new(1)=0; T_new(end)=0; T_1d=T_new;
  end

[FLUID MECHANICS]
Pipe flow (Bernoulli + Darcy-Weisbach):
  rho=1000; mu=0.001; D=0.05;
  v=linspace(0.1,5,100);
  Re=rho*v*D/mu;
  f_darcy=zeros(size(Re));
  f_darcy(Re<2300)=64./Re(Re<2300);             % laminar
  f_darcy(Re>=2300)=0.316*Re(Re>=2300).^(-0.25); % turbulent Blasius
  L_pipe=100;
  h_f=f_darcy.*L_pipe.*v.^2/(D*2*9.81);
  figure('Name','Pipe Flow');
  subplot(1,2,1); plot(v,Re,'b-','LineWidth',2); title('Reynolds Number'); xlabel('v(m/s)'); ylabel('Re'); grid on;
  subplot(1,2,2); plot(v,h_f,'r-','LineWidth',2); title('Head Loss'); xlabel('v(m/s)'); ylabel('hf(m)'); grid on;

Navier-Stokes lid-driven cavity (2D):
  N=32; Re_cav=100; dx=1/(N-1); dt=0.001;
  u=zeros(N,N); v_ns=zeros(N,N); p=zeros(N,N);
  % Simplified pressure-velocity coupling

[THERMODYNAMICS]
Carnot cycle:
  T_H=800; T_L=300;
  eta_carnot=1-T_L/T_H;
  fprintf('Carnot efficiency: %.2f%%\\n',eta_carnot*100);
  V1=0.001; V2=0.008; gamma=1.4;
  theta=linspace(0,2*pi,1000);
  % P-V diagram with isentropic and isothermal processes

Ideal gas law variations:
  R=8.314; n=1;
  T_range=linspace(200,600,100);
  P_range=linspace(1e5,10e6,100);
  [T_grid,P_grid]=meshgrid(T_range,P_range);
  V_grid=n*R*T_grid./P_grid;
  figure('Name','Ideal Gas');
  surf(T_grid,P_grid/1e6,V_grid,'EdgeColor','none');
  title('PVT Surface'); xlabel('T(K)'); ylabel('P(MPa)'); zlabel('V(m^3)'); colorbar;

[ELECTRICAL / ELECTRONICS]
AC circuit analysis:
  f_ac=50; w_ac=2*pi*f_ac; R_ac=10; L_ac=0.05; C_ac=200e-6;
  t_ac=linspace(0,0.1,10000);
  Vs=325*sin(w_ac*t_ac);
  Z=R_ac+1j*w_ac*L_ac+1/(1j*w_ac*C_ac);
  I_peak=325/abs(Z); phi=angle(Z);
  I_t=I_peak*sin(w_ac*t_ac-phi);
  figure('Name','AC Circuit');
  yyaxis left; plot(t_ac*1000,Vs,'b-','LineWidth',1.5); ylabel('Voltage(V)');
  yyaxis right; plot(t_ac*1000,I_t,'r-','LineWidth',1.5); ylabel('Current(A)');
  title('AC Circuit'); xlabel('Time(ms)'); grid on;

Power analysis:
  P_real=0.5*325*I_peak*cos(phi);
  Q_react=0.5*325*I_peak*sin(phi);
  S_app=0.5*325*I_peak;
  pf=cos(phi);
  fprintf('P=%.2fW  Q=%.2fVAR  S=%.2fVA  PF=%.4f\\n',P_real,Q_react,S_app,pf);

RLC resonance:
  f_res=linspace(1,1000,5000);
  w_res=2*pi*f_res;
  Z_RLC=R_ac+1j*(w_res*L_ac-1./(w_res*C_ac));
  figure('Name','RLC'); plot(f_res,abs(Z_RLC),'b-','LineWidth',2);
  title('RLC Impedance'); xlabel('f(Hz)'); ylabel('|Z|(Ohm)'); grid on;

[ROBOTICS / KINEMATICS]
2-link arm forward kinematics:
  L1=0.5; L2=0.3;
  theta1=linspace(0,pi,100); theta2=linspace(-pi/2,pi/2,100);
  x_ee=L1*cos(theta1)+L2*cos(theta1+theta2);
  y_ee=L1*sin(theta1)+L2*sin(theta1+theta2);
  figure('Name','Robot'); plot(x_ee,y_ee,'b-','LineWidth',2);
  title('End-effector Path'); xlabel('X(m)'); ylabel('Y(m)'); axis equal; grid on;

Inverse kinematics:
  x_t=0.4; y_t=0.3;
  D=(x_t^2+y_t^2-L1^2-L2^2)/(2*L1*L2);
  th2=atan2(sqrt(1-D^2),D);
  th1=atan2(y_t,x_t)-atan2(L2*sin(th2),L1+L2*cos(th2));

[STATISTICS / DATA ANALYSIS]
Descriptive statistics (no toolbox):
  data=randn(1,1000)*15+100;
  mu=mean(data); sigma=std(data); med=median(data);
  fprintf('Mean=%.2f  Std=%.2f  Median=%.2f\\n',mu,sigma,med);
  figure('Name','Stats');
  subplot(1,2,1); histogram(data,30,'FaceColor','steelblue'); title('Histogram'); grid on;
  x_pdf=linspace(mu-4*sigma,mu+4*sigma,200);
  pdf_y=(1/(sigma*sqrt(2*pi)))*exp(-0.5*((x_pdf-mu)/sigma).^2);
  subplot(1,2,2); plot(x_pdf,pdf_y,'r-','LineWidth',2); title('PDF'); grid on;

Linear regression (no toolbox):
  n_pts=100; x_d=(1:n_pts)'; y_d=2.5*x_d+10+randn(n_pts,1)*20;
  X_aug=[ones(n_pts,1),x_d];
  beta=X_aug\y_d;
  y_pred=X_aug*beta;
  SS_res=sum((y_d-y_pred).^2); SS_tot=sum((y_d-mean(y_d)).^2);
  R2=1-SS_res/SS_tot;
  fprintf('Slope=%.4f  Intercept=%.4f  R2=%.4f\\n',beta(2),beta(1),R2);
  figure('Name','Regression');
  scatter(x_d,y_d,20,'b','filled','MarkerFaceAlpha',0.5); hold on;
  plot(x_d,y_pred,'r-','LineWidth',2); hold off;
  title(sprintf('Linear Regression R^2=%.3f',R2)); xlabel('X'); ylabel('Y'); grid on;

Monte Carlo:
  N_mc=100000; x_mc=rand(N_mc,1); y_mc=rand(N_mc,1);
  inside=x_mc.^2+y_mc.^2<=1;
  pi_est=4*sum(inside)/N_mc;
  fprintf('Pi estimate: %.5f\\n',pi_est);

[IMAGE PROCESSING — base MATLAB only]
Basic operations:
  img=double(imread('image.png'))/255;     % normalize
  img_gray=0.299*img(:,:,1)+0.587*img(:,:,2)+0.114*img(:,:,3);  % RGB to gray
  % Sobel edge detection manually
  Kx=[−1 0 1;−2 0 2;−1 0 1]; Ky=Kx';
  Gx=conv2(img_gray,Kx,'same'); Gy=conv2(img_gray,Ky,'same');
  edges=sqrt(Gx.^2+Gy.^2);

Histogram equalization (manual):
  hist_c=histcounts(img_gray(:),256,'Normalization','cdf');
  img_eq=hist_c(max(1,round(img_gray*255+1)));

[NUMERICAL METHODS]
Newton-Raphson:
  f=@(x) x.^3-2*x-5; df=@(x) 3*x.^2-2;
  x0=2; tol=1e-10; maxiter=50;
  for i=1:maxiter
      x1=x0-f(x0)/df(x0);
      if abs(x1-x0)<tol, break; end
      x0=x1;
  end
  fprintf('Root=%.10f  iterations=%d\\n',x1,i);

Gaussian elimination:
  A=[2 1 -1;-3 -1 2;-2 1 2]; b=[8;-11;-3];
  x_sol=A\b;
  fprintf('Solution: x=%.4f y=%.4f z=%.4f\\n',x_sol(1),x_sol(2),x_sol(3));

Trapezoidal integration:
  f_int=@(x) sin(x).^2.*exp(-x/5);
  x_int=linspace(0,10,10000);
  area=trapz(x_int,f_int(x_int));
  fprintf('Integral=%.6f\\n',area);

Euler method:
  dt_eu=0.01; t_eu=0:dt_eu:10; y_eu=zeros(size(t_eu)); y_eu(1)=1;
  dydt=@(t,y) -2*y+sin(t);
  for k=1:length(t_eu)-1
      y_eu(k+1)=y_eu(k)+dt_eu*dydt(t_eu(k),y_eu(k));
  end

[OPTIMIZATION]
Gradient descent:
  f_opt=@(x,y)(x-3).^2+(y-2).^2+x.*y;
  dfdx=@(x,y)2*(x-3)+y; dfdy=@(x,y)2*(y-2)+x;
  lr=0.1; x_o=0; y_o=0;
  path_x=zeros(1,200); path_y=zeros(1,200);
  for i=1:200
      path_x(i)=x_o; path_y(i)=y_o;
      x_o=x_o-lr*dfdx(x_o,y_o);
      y_o=y_o-lr*dfdy(x_o,y_o);
  end

[MACHINE LEARNING — manual, no toolbox]
K-means clustering:
  data_km=[randn(50,2)+2; randn(50,2)-2; randn(50,2)+[2,-2]];
  K=3; centroids=data_km(randperm(size(data_km,1),K),:);
  idx=zeros(size(data_km,1),1);
  for iter=1:50
      dists=zeros(size(data_km,1),K);
      for k=1:K, dists(:,k)=sum((data_km-centroids(k,:)).^2,2); end
      [~,idx]=min(dists,[],2);
      for k=1:K
          if any(idx==k), centroids(k,:)=mean(data_km(idx==k,:)); end
      end
  end
  figure('Name','KMeans'); gscatter(data_km(:,1),data_km(:,2),idx); title('K-Means'); grid on;

Neural network (manual 2-layer):
  X_nn=randn(2,200); Y_nn=double(sum(X_nn.^2)<1);
  W1=randn(4,2)*0.1; b1=zeros(4,1);
  W2=randn(1,4)*0.1; b2=0; lr_nn=0.01;
  sigmoid=@(z)1./(1+exp(-z));
  for epoch=1:1000
      Z1=W1*X_nn+b1; A1=sigmoid(Z1);
      Z2=W2*A1+b2;   A2=sigmoid(Z2);
      dZ2=A2-Y_nn; dW2=dZ2*A1'/200; db2=mean(dZ2);
      dZ1=(W2'*dZ2).*A1.*(1-A1); dW1=dZ1*X_nn'/200; db1=mean(dZ1,2);
      W2=W2-lr_nn*dW2; b2=b2-lr_nn*db2;
      W1=W1-lr_nn*dW1; b1=b1-lr_nn*db1;
  end

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN GENERATING CODE:
1. Identify which domain the project belongs to
2. Use the EXACT pattern from that domain above
3. Fill in the specific values for the project
4. Never invent new patterns — adapt from the templates above
5. Generate 8-12 steps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ═══════════════════════════════════════════════════════════════════════
//  BLENDER SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════
const BLENDER_SYSTEM = `You are a Blender 4.2 Python expert. Generate complete accurate 3D projects.
Return ONLY a raw JSON object. No markdown. No explanation. Start with { end with }

JSON FORMAT:
{
  "title": "string",
  "description": "string",
  "estimatedTime": "string",
  "software": "blender",
  "steps": [{"label": "string", "cmd": "line1\\nline2\\nline3", "produces": "string"}]
}

RULES:
1. NEVER use read_factory_settings() — scene is pre-cleared
2. After EVERY _add(): obj=bpy.context.active_object; obj.name="UniqueName"
3. Before EVERY _add(): bpy.ops.object.select_all(action='DESELECT')
4. Dimensions in METERS: 50mm=0.05, 100mm=0.1, 20mm=0.02
5. Materials: mat=bpy.data.materials.new(name="X"); mat.use_nodes=True; bsdf=mat.node_tree.nodes.get("Principled BSDF"); bsdf.inputs["Metallic"].default_value=0.9
6. Boolean: apply modifier then bpy.data.objects.remove(cutter,do_unlink=True)
7. Last step: lighting + camera
8. Unique names for ALL objects and materials
9. print() at end of every step
10. Define loop variables BEFORE the loop
11. Generate 10-12 steps`;

// ─────────────────────────────────────────────
//  GENERATE
// ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
//  KICAD SYSTEM PROMPT
//  Generates KiCad Python API scripts for schematics and PCB
// ═══════════════════════════════════════════════════════════════════════
const KICAD_SYSTEM = `You are an expert KiCad 10 Python developer and electronics engineer.
Generate complete accurate KiCad Python scripts for schematics and PCB designs.
Return ONLY a raw JSON object. No markdown. No explanation. Start with { end with }

JSON FORMAT:
{
  "title": "string",
  "description": "string",
  "estimatedTime": "string",
  "software": "kicad",
  "steps": [
    {"label": "string", "cmd": "python kicad api line1\nline2\nline3", "produces": "string"}
  ]
}

KICAD PYTHON API RULES — follow exactly:

[1] Always import at top of first step:
import pcbnew
import schematic
from pcbnew import *

[2] Create new board:
board = pcbnew.CreateEmptyBoard()
board.SetBoardThickness(pcbnew.FromMM(1.6))

[3] Add footprint:
fp = pcbnew.FootprintLoad('/usr/share/kicad/footprints/Resistor_SMD.pretty', 'R_0805_2012Metric')
fp.SetReference('R1')
fp.SetValue('10k')
fp.SetPosition(pcbnew.FromMM(100), pcbnew.FromMM(100))
board.Add(fp)

[4] Add track (wire):
track = pcbnew.PCB_TRACK(board)
track.SetStart(pcbnew.VECTOR2I(pcbnew.FromMM(100), pcbnew.FromMM(100)))
track.SetEnd(pcbnew.VECTOR2I(pcbnew.FromMM(110), pcbnew.FromMM(100)))
track.SetWidth(pcbnew.FromMM(0.25))
track.SetLayer(pcbnew.F_Cu)
board.Add(track)

[5] Add via:
via = pcbnew.PCB_VIA(board)
via.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(105), pcbnew.FromMM(105)))
via.SetDrill(pcbnew.FromMM(0.4))
via.SetWidth(pcbnew.FromMM(0.8))
board.Add(via)

[6] Save board:
board.Save('/path/to/output.kicad_pcb')
pcbnew.Refresh()

[7] For schematic use KiCad scripting:
import subprocess
sch_content = """(kicad_sch (version 20230121) (generator eeschema)
  (paper "A4")
  (lib_symbols)
  (wire (pts (xy 100 100) (xy 150 100)))
)"""

CIRCUIT TYPES — generate accurate designs:
Resistor divider: two resistors in series between VCC and GND, output at midpoint
RC filter: resistor in series, capacitor to ground, calculate cutoff frequency
555 timer: IC with timing resistors and capacitor per datasheet
Op-amp inverting: feedback resistor, input resistor, proper biasing
Power supply: bridge rectifier + filter cap + voltage regulator
H-bridge: 4 MOSFETs/transistors for motor control
Microcontroller: MCU with decoupling caps, crystal, reset circuit

Always include:
- All component values calculated from real formulas
- Proper power and ground connections
- Decoupling capacitors on IC power pins
- Component references (R1, C1, U1 etc.)
- Net names for key signals

Generate 8-12 steps`;


async function generateAndFix(query, software) {
  const sysPrompt = software==='blender' ? BLENDER_SYSTEM : (software==='kicad' ? KICAD_SYSTEM : MATLAB_SYSTEM);
  const userMsg   = software==='blender'
    ? `Generate a detailed Blender 4.2 Python 3D model for: "${query}"\nFollow ALL rules. Use correct engineering dimensions.\nRETURN ONLY JSON starting with {`
    : software==='kicad'
    ? `Generate a complete KiCad Python project for: "${query}"\nFollow ALL KiCad Python API rules precisely. Calculate correct values.\nRETURN ONLY JSON starting with {`
    : `Generate a complete MATLAB R2025a project for: "${query}"\nIdentify the engineering domain and use the EXACT pattern from that domain.\nUse ONLY base MATLAB — no toolbox functions.\nRETURN ONLY JSON starting with {`;

  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      console.log(`\n[${software}] Attempt ${attempt}/3: "${query}"`);
      const text    = await callAI(sysPrompt, userMsg);
      let project   = parseJSON(text);
      project.software = software;
      project.steps    = cleanSteps(project.steps);
      if(!project.steps||project.steps.length===0) throw new Error('No steps generated');
      console.log(`[${software}] Success: "${project.title}" — ${project.steps.length} steps`);
      return project;
    }catch(e){
      console.log(`[${software}] Attempt ${attempt} failed: ${e.message}`);
      lastError=e;
      if(attempt<3) await new Promise(r=>setTimeout(r,2000));
    }
  }
  throw lastError;
}

async function fixMATLABError(originalCode, errorMessage, attempt) {
  console.log(`[fix-matlab] Attempt ${attempt}: ${errorMessage.slice(0,100)}`);
  const sys  = `You are a MATLAB debugger. Fix the error. Return ONLY corrected MATLAB code. No explanation.`;
  const user = `ERROR:\n${errorMessage.slice(0,400)}\n\nCODE:\n${originalCode.slice(0,3000)}\n\nFixes needed:\n- Replace tf() ss() bode() butter() with ode45 and manual math\n- Use s=1j*w with logspace for frequency response — never s=-10:10\n- Fix .* ./ .^ for arrays\n- Fix undefined variables\n- Remove semicolon after end\nReturn ONLY fixed code.`;
  const r = await callAI(sys, user);
  return r.replace(/```matlab\n?/gi,'').replace(/```m\n?/gi,'').replace(/```\n?/g,'').trim();
}

async function fixBlenderError(originalCode, errorMessage, attempt) {
  console.log(`[fix-blender] Attempt ${attempt}: ${errorMessage.slice(0,100)}`);
  const sys  = `You are a Blender 4.2 Python debugger. Fix the error. Return ONLY corrected Python code. No explanation.`;
  const user = `ERROR:\n${errorMessage.slice(0,400)}\n\nCODE:\n${originalCode.slice(0,3000)}\n\nReturn ONLY fixed Python code.`;
  const r = await callAI(sys, user);
  return r.replace(/```python\n?/gi,'').replace(/```\n?/g,'').trim();
}

async function generateMATLABProject(query)  { return generateAndFix(query,'matlab');  }
async function generateKiCadProject(query)   { return generateAndFix(query,'kicad');  }
async function generateBlenderProject(query) { return generateAndFix(query,'blender'); }
async function generateProject(query) {
  const sw=detectSoftware(query);
  console.log(`[agent] Detected: ${sw}`);
  return generateAndFix(query,sw);
}
async function generateFollowUp(originalQuery, followUpQuery, previousSteps, software) {
  const sys  = software==='blender' ? BLENDER_SYSTEM : (software==='kicad' ? KICAD_SYSTEM : MATLAB_SYSTEM);
  const contextMsg = software==='blender' ? 'Scene objects exist.' : (software==='kicad' ? 'Circuit components exist.' : 'Workspace variables exist.');
  const user = `Original: "${originalQuery}" — Follow-up: "${followUpQuery}"\nDone: ${(previousSteps||[]).map((s,i)=>`${i+1}. ${s.label}`).join(', ')}\n${contextMsg}\nGenerate follow-up steps. RETURN ONLY JSON starting with {`;
  const text    = await callAI(sys, user);
  const project = parseJSON(text);
  project.software = software;
  project.steps    = cleanSteps(project.steps);
  return project;
}

module.exports = {
  generateProject, generateMATLABProject, generateBlenderProject, generateKiCadProject,
  generateFollowUp, fixMATLABError, fixBlenderError, detectSoftware,
};
