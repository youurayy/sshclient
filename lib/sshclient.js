
var laeh2 = require('laeh2');
var _e = laeh2._e;
var _x = laeh2._x;
var ssh2 = require('ssh2');
var async = require('async-mini');

function toBuff(bodyOrBuff) {
    return bodyOrBuff instanceof Buffer ? bodyOrBuff :
        new Buffer(bodyOrBuff, 'utf8');
}

exports.session = function session(opts, _cb) { // cb(err, conn)
    
    if(!opts.console)
        opts.console = console;
    
    var conn = new ssh2();
    var done;
    
    function cb(err, ses) {
        if(done) {
            if(err && typeof(err) !== 'boolean')
                opts.console.log(err.stack || err);
        }
        else {
            done = true;
            _cb(err, ses);
        }
    }
    
    conn.on('ready', _x(cb, true, function() {
        
        var ses = new exports.Session(opts, conn);
        
        if(opts.session) {
            
            var ff = opts.session.map(function(v) {
                if(v.op === 'writeFile') {
                    return _x(null, false, function(cb) {
                        ses.writeFile(v.path, v.body, _x(cb, true, function(err) {
                            if(opts.debug)
                                opts.console.log('file %s was written', v.path);
                            cb();
                        }));
                    });
                }
                else if(v.op === 'exec') {
                    return _x(null, false, function(cb) {
                        ses.exec(v.command, _x(cb, true, function(err, out) {
                            if(opts.debug) {
                                opts.console.log('code: %s, signal: %s, out: %s, err: %s', 
                                    out.code, out.signal, out.stdout, out.stderr);
                            }
                            cb();
                        }));
                    });
                }
                else {
                    _e('bad op: ' + v.op);
                }
            });
            
            async.series(ff, _x(cb, false, function(err) {
                try {
                    ses.quit();
                }
                catch(e) {
                }
                if(opts.debug)
                    console.log('session quit');
                cb(err);
            }));
        }
        else {
            cb(null, ses);
        }
    }));
    
    conn.on('connect', _x(cb, false, function() {
        if(opts.debug)
            opts.console.log('connected to %s:%d', opts.host, opts.port || 22);
    }));
    
    conn.on('error', _x(cb, true, cb));
    conn.on('end', _x(cb, false, cb));
    conn.on('close', _x(cb, false, cb));
    
    conn.connect(opts);
};

exports.Session = function Session(opts, conn) {
    
    this.conn = conn;
    
    this.exec = function(cmd, _cb) { // cb(err, { code, signal, stdout, stderr })

        var done;
        var stdout = '', stderr = '';

        function cb(err, code, signal) {
            if(done) {
                if(err && typeof(err) !== 'boolean')
                    console.log(err.stack || err);
            }
            else {
                done = true;
                if(!err) {
                    _cb(code ? new Error('command failed: ' + cmd) : null, {
                        code: code,
                        signal: signal,
                        stdout: stdout,
                        stderr: stderr
                    });
                }
                else {
                    _cb(err);
                }
            }
        }
        
        conn.exec(cmd, _x(cb, true, function(err, stream) {
            
            stream.on('data', _x(cb, false, function(data, ext) {
                if(ext === 'stderr')
                    stderr += data;
                else
                    stdout += data;
            }));
            
            stream.on('exit', _x(cb, false, function(code, signal) {
                if(opts.debug)
                    opts.console.log('exec exit');
                cb(null, code, signal);
            }));
            
            // stream.on('end', _x(cb, false, cb));
            stream.on('close', _x(cb, false, cb));
            stream.on('error', _x(cb, true, cb));
        }));
    };
    
    this.writeFile = function(path, body, _cb) { // cb(err)

        var done;
        var buff = toBuff(body);

        function cb(err, code, signal) {
            if(done) {
                if(err && typeof(err) !== 'boolean')
                    opts.console.log(err.stack || err);
            }
            else {
                done = true;
                _cb(err);
            }
        }
        
        conn.sftp(_x(cb, true, function(err, sftp) {
            
            sftp.on('end', _x(cb, false, cb));
            sftp.on('close', _x(cb, false, cb));
            sftp.on('error', _x(cb, true, cb));
            
            var mode = 'w';
            var atts = {}; // uid, gid
            
            sftp.open(path, mode, atts, _x(cb, true, function(err, handle) {
                sftp.write(handle, buff, 0, buff.length, 0, _x(cb, true, function(err) {
                    sftp.close(handle, _x(cb, true, function(err) {
                        sftp.end();
                    }));
                }));
            }));
        }));
    };
    
    this.quit = function() {
        conn.end();
    };
};
