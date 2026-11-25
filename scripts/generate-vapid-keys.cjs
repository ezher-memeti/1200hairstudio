// Private file only, never stdout/.env edits. Generate once; do not rotate on deployment.
const fs=require('node:fs'),path=require('node:path');
const output=process.argv[2];
const outside = file => { const relative=path.relative(process.cwd(),file); return relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative); };
if(!output||!path.isAbsolute(output)||!outside(output)){
 console.error('Supply a new absolute output filename outside the repository.');process.exit(1);
}
(async()=>{ try{
 fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});
 if (!outside(path.join(fs.realpathSync(path.dirname(output)),path.basename(output)))) throw new Error('private_path_required');
 fs.writeFileSync(output,JSON.stringify((await import('web-push')).generateVAPIDKeys(),null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('VAPID identity saved to the requested private file. Keys were not printed. Keep this identity across deployments.');
}catch{console.error('Private key output unavailable or already exists. Existing credentials were not changed.');process.exitCode=1;}
})();
