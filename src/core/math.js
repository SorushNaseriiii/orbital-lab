const M = {};
  M.DEG = Math.PI / 180;
  M.RAD = 180 / Math.PI;
  M.vec3 = (x=0,y=0,z=0) => [x,y,z];
  M.add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  M.sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  M.scale = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
  M.dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  M.cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  M.norm = a => Math.hypot(a[0],a[1],a[2]);
  M.normalize = a => { const n=M.norm(a)||1; return [a[0]/n,a[1]/n,a[2]/n]; };
  M.clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  M.lerp = (a,b,t) => a+(b-a)*t;
  M.lerp3 = (a,b,t) => [M.lerp(a[0],b[0],t),M.lerp(a[1],b[1],t),M.lerp(a[2],b[2],t)];
  M.mod = (a,n) => ((a%n)+n)%n;

  M.mat4Identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  M.mat4Multiply = (a,b) => {
    const out = new Float32Array(16);
    for (let c=0;c<4;c++) for (let r=0;r<4;r++) {
      out[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
    }
    return out;
  };
  M.mat4Translate = (x,y,z) => {
    const m=M.mat4Identity(); m[12]=x; m[13]=y; m[14]=z; return m;
  };
  M.mat4Scale = (x,y,z) => {
    const m=M.mat4Identity(); m[0]=x; m[5]=y; m[10]=z; return m;
  };
  M.mat4RotateX = a => {
    const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
  };
  M.mat4RotateY = a => {
    const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
  };
  M.mat4RotateZ = a => {
    const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);
  };
  M.mat4Perspective = (fovy,aspect,near,far) => {
    const f=1/Math.tan(fovy/2), nf=1/(near-far), out=new Float32Array(16);
    out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
    out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0;
    return out;
  };
  M.mat4LookAt = (eye,target,up) => {
    const z=M.normalize(M.sub(eye,target));
    let x=M.normalize(M.cross(up,z));
    if (M.norm(x)<1e-8) x=[1,0,0];
    const y=M.cross(z,x);
    return new Float32Array([
      x[0],y[0],z[0],0,
      x[1],y[1],z[1],0,
      x[2],y[2],z[2],0,
      -M.dot(x,eye),-M.dot(y,eye),-M.dot(z,eye),1
    ]);
  };
  M.mat4FromBasis = (x,y,z,t) => new Float32Array([
    x[0],x[1],x[2],0,
    y[0],y[1],y[2],0,
    z[0],z[1],z[2],0,
    t[0],t[1],t[2],1
  ]);
  M.transformPoint = (m,p) => {
    const x=p[0],y=p[1],z=p[2];
    const w=m[3]*x+m[7]*y+m[11]*z+m[15] || 1;
    return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w, (m[1]*x+m[5]*y+m[9]*z+m[13])/w, (m[2]*x+m[6]*y+m[10]*z+m[14])/w];
  };
  M.project = (m,p,width,height) => {
    const x=p[0],y=p[1],z=p[2];
    const cx=m[0]*x+m[4]*y+m[8]*z+m[12];
    const cy=m[1]*x+m[5]*y+m[9]*z+m[13];
    const cz=m[2]*x+m[6]*y+m[10]*z+m[14];
    const cw=m[3]*x+m[7]*y+m[11]*z+m[15];
    if (cw<=0) return null;
    return {x:(cx/cw*.5+.5)*width, y:(1-(cy/cw*.5+.5))*height, z:cz/cw};
  };
  M.hexToRgb = hex => {
    const s=(hex||'#ffffff').replace('#','');
    const v=s.length===3?s.split('').map(c=>c+c).join(''):s;
    const n=parseInt(v,16);
    return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];
  };
  M.formatSci = (value, digits=3) => {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value)<1e-14) return '0';
    return value.toExponential(digits-1).replace('e+','e');
  };
  M.formatCompact = (value, digits=3) => {
    if (!Number.isFinite(value)) return '—';
    const a=Math.abs(value);
    if (a>=1e6 || (a>0 && a<1e-2)) return M.formatSci(value,digits);
    return value.toLocaleString('en-US',{maximumFractionDigits:digits});
  };
export { M as OrbitMath };
if (typeof window !== 'undefined') window.OrbitMath = M;
