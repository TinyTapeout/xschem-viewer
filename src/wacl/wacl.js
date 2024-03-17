import waclUrl from './wacl.wasm?url';
export const wacl = (function () {
  function require() {
    throw new Error('Dynamic requires are not currently supported by wacl');
  }

  var _Interp = null;
  var _getInterp = null;
  var _eval = null;
  var _getStringResult = null;
  var _Result = null;
  var _OnReadyCb = function (obj) {};
  var _TclException = function (errCode, errInfo) {
    this.errorCode = errCode;
    this.errorInfo = errInfo;
    this.toString = function () {
      return 'TclException: ' + this.errorCode + ' => ' + this.errorInfo;
    };
  };
  var _currPath = 'tcl/';
  var _wasmbly = (function (url) {
    return new Promise(function (resolve, reject) {
      var wasmXHR = new XMLHttpRequest();
      wasmXHR.open('GET', url, true);
      wasmXHR.responseType = 'arraybuffer';
      wasmXHR.onload = function () {
        resolve(wasmXHR.response);
      };
      wasmXHR.onerror = function () {
        reject('error ' + wasmXHR.status);
      };
      wasmXHR.send(null);
    });
  })(waclUrl);
  var Module;
  if (typeof Module === 'undefined')
    Module = eval('(function() { try { return Module || {} } catch(e) { return {} } })()');
  Module['noInitialRun'] = false;
  Module['noExitRuntime'] = true;
  Module['print'] = function (txt) {
    console.log('wacl stdout: ' + txt);
  };
  Module['printErr'] = function (txt) {
    console.error('wacl stderr: ' + txt);
  };
  Module['filePackagePrefixURL'] = _currPath;
  Module['instantiateWasm'] = function (imports, successCallback) {
    _wasmbly.then(function (wasmBinary) {
      var wasmInstantiate = WebAssembly.instantiate(new Uint8Array(wasmBinary), imports)
        .then(function (output) {
          Module.testWasmInstantiationSucceeded = 1;
          successCallback(output.instance);
        })
        .catch(function (e) {
          console.log('wasm instantiation failed! ', e);
        });
    });
    return {};
  };
  Module['postRun'] = function () {
    _getInterp = Module.cwrap('Wacl_GetInterp', 'number', []);
    _eval = Module.cwrap('Tcl_Eval', 'number', ['number', 'string']);
    _getStringResult = Module.cwrap('Tcl_GetStringResult', 'string', ['number']);
    _Interp = _getInterp();
    _Result = {
      Module: Module,
      set stdout(fn) {
        Module.print = fn;
      },
      set stderr(fn) {
        Module.printErr = fn;
      },
      get interp() {
        return _Interp;
      },
      str2ptr: function (strObj) {
        return Module.allocate(Module.intArrayFromString(strObj), 'i8', Module.ALLOC_NORMAL);
      },
      ptr2str: function (strPtr) {
        return Module.UTF8ToString(strPtr);
      },
      jswrap: function (fcn, returnType, argType) {
        var fnPtr = Runtime.addFunction(fcn);
        return '::wacl::jscall ' + fnPtr + ' ' + returnType + ' ' + argType;
      },
      Eval: function (tclStr) {
        _eval(this.interp, 'catch {' + tclStr + '} ::jsResult');
        var errCode = _getStringResult(this.interp);
        if (errCode != 0) {
          _eval(this.interp, 'set ::errorInfo');
          var errInfo = _getStringResult(this.interp);
          throw new _TclException(errCode, errInfo);
        } else {
          _eval(this.interp, 'set ::jsResult');
          return _getStringResult(this.interp);
        }
      },
    };
    _OnReadyCb(_Result);
  };
  if (!Module.expectedDataFileDownloads) {
    Module.expectedDataFileDownloads = 0;
    Module.finishedDataFileDownloads = 0;
  }
  Module.expectedDataFileDownloads++;
  (function () {
    var loadPackage = function (metadata) {
      var PACKAGE_PATH;
      if (typeof window === 'object') {
        PACKAGE_PATH = window['encodeURIComponent'](
          window.location.pathname
            .toString()
            .substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/',
        );
      } else if (typeof location !== 'undefined') {
        PACKAGE_PATH = encodeURIComponent(
          location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) +
            '/',
        );
      } else {
        throw 'using preloaded data can only be done on a web page or in a web worker';
      }
      var PACKAGE_NAME = 'wacl-library.data';
      var REMOTE_PACKAGE_BASE = 'wacl-library.data';
      if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
        Module['locateFile'] = Module['locateFilePackage'];
        Module.printErr(
          'warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)',
        );
      }
      var REMOTE_PACKAGE_NAME =
        typeof Module['locateFile'] === 'function'
          ? Module['locateFile'](REMOTE_PACKAGE_BASE)
          : (Module['filePackagePrefixURL'] || '') + REMOTE_PACKAGE_BASE;
      var REMOTE_PACKAGE_SIZE = metadata.remote_package_size;
      var PACKAGE_UUID = metadata.package_uuid;
      function fetchRemotePackage(packageName, packageSize, callback, errback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', packageName, true);
        xhr.responseType = 'arraybuffer';
        xhr.onprogress = function (event) {
          var url = packageName;
          var size = packageSize;
          if (event.total) size = event.total;
          if (event.loaded) {
            if (!xhr.addedTotal) {
              xhr.addedTotal = true;
              if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
              Module.dataFileDownloads[url] = { loaded: event.loaded, total: size };
            } else {
              Module.dataFileDownloads[url].loaded = event.loaded;
            }
            var total = 0;
            var loaded = 0;
            var num = 0;
            for (var download in Module.dataFileDownloads) {
              var data = Module.dataFileDownloads[download];
              total += data.total;
              loaded += data.loaded;
              num++;
            }
            total = Math.ceil((total * Module.expectedDataFileDownloads) / num);
            if (Module['setStatus'])
              Module['setStatus']('Downloading data... (' + loaded + '/' + total + ')');
          } else if (!Module.dataFileDownloads) {
            if (Module['setStatus']) Module['setStatus']('Downloading data...');
          }
        };
        xhr.onerror = function (event) {
          throw new Error('NetworkError for: ' + packageName);
        };
        xhr.onload = function (event) {
          if (
            xhr.status == 200 ||
            xhr.status == 304 ||
            xhr.status == 206 ||
            (xhr.status == 0 && xhr.response)
          ) {
            var packageData = xhr.response;
            callback(packageData);
          } else {
            throw new Error(xhr.statusText + ' : ' + xhr.responseURL);
          }
        };
        xhr.send(null);
      }
      function handleError(error) {
        console.error('package error:', error);
      }
      var fetchedCallback = null;
      var fetched = Module['getPreloadedPackage']
        ? Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE)
        : null;
      if (!fetched)
        fetchRemotePackage(
          REMOTE_PACKAGE_NAME,
          REMOTE_PACKAGE_SIZE,
          function (data) {
            if (fetchedCallback) {
              fetchedCallback(data);
              fetchedCallback = null;
            } else {
              fetched = data;
            }
          },
          handleError,
        );
      function runWithFS() {
        function assert(check, msg) {
          if (!check) throw msg + new Error().stack;
        }
        Module['FS_createPath']('/', 'usr', true, true);
        Module['FS_createPath']('/usr', 'lib', true, true);
        Module['FS_createPath']('/usr/lib', 'html', true, true);
        Module['FS_createPath']('/usr/lib', 'tcl8', true, true);
        Module['FS_createPath']('/usr/lib/tcl8', '8.5', true, true);
        Module['FS_createPath']('/usr/lib/tcl8', '8.6', true, true);
        Module['FS_createPath']('/usr/lib/tcl8', '8.4', true, true);
        Module['FS_createPath']('/usr/lib/tcl8/8.4', 'platform', true, true);
        Module['FS_createPath']('/usr/lib', 'json', true, true);
        Module['FS_createPath']('/usr/lib/json', 'tests', true, true);
        Module['FS_createPath']('/usr/lib', 'tcl8.6', true, true);
        Module['FS_createPath']('/usr/lib/tcl8.6', 'http1.0', true, true);
        Module['FS_createPath']('/usr/lib/tcl8.6', 'encoding', true, true);
        Module['FS_createPath']('/usr/lib/tcl8.6', 'opt0.4', true, true);
        Module['FS_createPath']('/usr/lib/tcl8.6', 'msgs', true, true);
        Module['FS_createPath']('/usr/lib', 'fileutil', true, true);
        Module['FS_createPath']('/usr/lib', 'ncgi', true, true);
        Module['FS_createPath']('/usr/lib', 'uri', true, true);
        Module['FS_createPath']('/usr/lib', 'cmdline', true, true);
        Module['FS_createPath']('/usr/lib', 'javascript', true, true);
        function DataRequest(start, end, crunched, audio) {
          this.start = start;
          this.end = end;
          this.crunched = crunched;
          this.audio = audio;
        }
        DataRequest.prototype = {
          requests: {},
          open: function (mode, name) {
            this.name = name;
            this.requests[name] = this;
            Module['addRunDependency']('fp ' + this.name);
          },
          send: function () {},
          onload: function () {
            var byteArray = this.byteArray.subarray(this.start, this.end);
            this.finish(byteArray);
          },
          finish: function (byteArray) {
            var that = this;
            Module['FS_createDataFile'](this.name, null, byteArray, true, true, true);
            Module['removeRunDependency']('fp ' + that.name);
            this.requests[this.name] = null;
          },
        };
        var files = metadata.files;
        for (let i = 0; i < files.length; ++i) {
          new DataRequest(files[i].start, files[i].end, files[i].crunched, files[i].audio).open(
            'GET',
            files[i].filename,
          );
        }
        function processPackageData(arrayBuffer) {
          Module.finishedDataFileDownloads++;
          assert(arrayBuffer, 'Loading data file failed.');
          assert(arrayBuffer instanceof ArrayBuffer, 'bad input to processPackageData');
          var byteArray = new Uint8Array(arrayBuffer);
          if (Module['SPLIT_MEMORY'])
            Module.printErr(
              'warning: you should run the file packager with --no-heap-copy when SPLIT_MEMORY is used, otherwise copying into the heap may fail due to the splitting',
            );
          var ptr = Module['getMemory'](byteArray.length);
          Module['HEAPU8'].set(byteArray, ptr);
          DataRequest.prototype.byteArray = Module['HEAPU8'].subarray(ptr, ptr + byteArray.length);
          var files = metadata.files;
          for (let i = 0; i < files.length; ++i) {
            DataRequest.prototype.requests[files[i].filename].onload();
          }
          Module['removeRunDependency']('datafile_wacl-library.data');
        }
        Module['addRunDependency']('datafile_wacl-library.data');
        if (!Module.preloadResults) Module.preloadResults = {};
        Module.preloadResults[PACKAGE_NAME] = { fromCache: false };
        if (fetched) {
          processPackageData(fetched);
          fetched = null;
        } else {
          fetchedCallback = processPackageData;
        }
      }
      if (Module['calledRun']) {
        runWithFS();
      } else {
        if (!Module['preRun']) Module['preRun'] = [];
        Module['preRun'].push(runWithFS);
      }
    };
    loadPackage({
      files: [
        { audio: 0, start: 0, crunched: 0, end: 39510, filename: '/usr/lib/html/html.tcl' },
        { audio: 0, start: 39510, crunched: 0, end: 39640, filename: '/usr/lib/html/pkgIndex.tcl' },
        {
          audio: 0,
          start: 39640,
          crunched: 0,
          end: 73574,
          filename: '/usr/lib/tcl8/8.5/msgcat-1.6.0.tm',
        },
        {
          audio: 0,
          start: 73574,
          crunched: 0,
          end: 173956,
          filename: '/usr/lib/tcl8/8.5/tcltest-2.4.0.tm',
        },
        {
          audio: 0,
          start: 173956,
          crunched: 0,
          end: 216707,
          filename: '/usr/lib/tcl8/8.6/http-2.8.9.tm',
        },
        {
          audio: 0,
          start: 216707,
          crunched: 0,
          end: 226719,
          filename: '/usr/lib/tcl8/8.4/platform-1.0.14.tm',
        },
        {
          audio: 0,
          start: 226719,
          crunched: 0,
          end: 232696,
          filename: '/usr/lib/tcl8/8.4/platform/shell-1.1.4.tm',
        },
        {
          audio: 0,
          start: 232696,
          crunched: 0,
          end: 233009,
          filename: '/usr/lib/json/pkgIndex.tcl',
        },
        {
          audio: 0,
          start: 233009,
          crunched: 0,
          end: 241754,
          filename: '/usr/lib/json/json_tcl.tcl',
        },
        { audio: 0, start: 241754, crunched: 0, end: 245991, filename: '/usr/lib/json/jsonc.tcl' },
        { audio: 0, start: 245991, crunched: 0, end: 253207, filename: '/usr/lib/json/json.tcl' },
        {
          audio: 0,
          start: 253207,
          crunched: 0,
          end: 258501,
          filename: '/usr/lib/json/json_write.tcl',
        },
        {
          audio: 0,
          start: 258501,
          crunched: 0,
          end: 262691,
          filename: '/usr/lib/json/tests/support.tcl',
        },
        {
          audio: 0,
          start: 262691,
          crunched: 0,
          end: 263507,
          filename: '/usr/lib/tcl8.6/parray.tcl',
        },
        { audio: 0, start: 263507, crunched: 0, end: 296946, filename: '/usr/lib/tcl8.6/safe.tcl' },
        {
          audio: 0,
          start: 296946,
          crunched: 0,
          end: 319905,
          filename: '/usr/lib/tcl8.6/package.tcl',
        },
        { audio: 0, start: 319905, crunched: 0, end: 341222, filename: '/usr/lib/tcl8.6/auto.tcl' },
        { audio: 0, start: 341222, crunched: 0, end: 352855, filename: '/usr/lib/tcl8.6/tm.tcl' },
        { audio: 0, start: 352855, crunched: 0, end: 358270, filename: '/usr/lib/tcl8.6/tclIndex' },
        { audio: 0, start: 358270, crunched: 0, end: 363130, filename: '/usr/lib/tcl8.6/word.tcl' },
        { audio: 0, start: 363130, crunched: 0, end: 387419, filename: '/usr/lib/tcl8.6/init.tcl' },
        {
          audio: 0,
          start: 387419,
          crunched: 0,
          end: 394747,
          filename: '/usr/lib/tcl8.6/history.tcl',
        },
        {
          audio: 0,
          start: 394747,
          crunched: 0,
          end: 523681,
          filename: '/usr/lib/tcl8.6/clock.tcl',
        },
        {
          audio: 0,
          start: 523681,
          crunched: 0,
          end: 528192,
          filename: '/usr/lib/tcl8.6/tclAppInit.c',
        },
        {
          audio: 0,
          start: 528192,
          crunched: 0,
          end: 528927,
          filename: '/usr/lib/tcl8.6/http1.0/pkgIndex.tcl',
        },
        {
          audio: 0,
          start: 528927,
          crunched: 0,
          end: 538616,
          filename: '/usr/lib/tcl8.6/http1.0/http.tcl',
        },
        {
          audio: 0,
          start: 538616,
          crunched: 0,
          end: 538808,
          filename: '/usr/lib/tcl8.6/encoding/iso2022-jp.enc',
        },
        {
          audio: 0,
          start: 538808,
          crunched: 0,
          end: 539899,
          filename: '/usr/lib/tcl8.6/encoding/cp1254.enc',
        },
        {
          audio: 0,
          start: 539899,
          crunched: 0,
          end: 540990,
          filename: '/usr/lib/tcl8.6/encoding/cp1253.enc',
        },
        {
          audio: 0,
          start: 540990,
          crunched: 0,
          end: 542083,
          filename: '/usr/lib/tcl8.6/encoding/macRoman.enc',
        },
        {
          audio: 0,
          start: 542083,
          crunched: 0,
          end: 636001,
          filename: '/usr/lib/tcl8.6/encoding/euc-kr.enc',
        },
        {
          audio: 0,
          start: 636001,
          crunched: 0,
          end: 721575,
          filename: '/usr/lib/tcl8.6/encoding/euc-cn.enc',
        },
        {
          audio: 0,
          start: 721575,
          crunched: 0,
          end: 722671,
          filename: '/usr/lib/tcl8.6/encoding/macDingbats.enc',
        },
        {
          audio: 0,
          start: 722671,
          crunched: 0,
          end: 723766,
          filename: '/usr/lib/tcl8.6/encoding/macRomania.enc',
        },
        {
          audio: 0,
          start: 723766,
          crunched: 0,
          end: 724856,
          filename: '/usr/lib/tcl8.6/encoding/cp775.enc',
        },
        {
          audio: 0,
          start: 724856,
          crunched: 0,
          end: 725950,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-2.enc',
        },
        {
          audio: 0,
          start: 725950,
          crunched: 0,
          end: 727041,
          filename: '/usr/lib/tcl8.6/encoding/cp1251.enc',
        },
        {
          audio: 0,
          start: 727041,
          crunched: 0,
          end: 728136,
          filename: '/usr/lib/tcl8.6/encoding/macTurkish.enc',
        },
        {
          audio: 0,
          start: 728136,
          crunched: 0,
          end: 729227,
          filename: '/usr/lib/tcl8.6/encoding/koi8-r.enc',
        },
        {
          audio: 0,
          start: 729227,
          crunched: 0,
          end: 730317,
          filename: '/usr/lib/tcl8.6/encoding/cp863.enc',
        },
        {
          audio: 0,
          start: 730317,
          crunched: 0,
          end: 731407,
          filename: '/usr/lib/tcl8.6/encoding/cp850.enc',
        },
        {
          audio: 0,
          start: 731407,
          crunched: 0,
          end: 732497,
          filename: '/usr/lib/tcl8.6/encoding/cp866.enc',
        },
        {
          audio: 0,
          start: 732497,
          crunched: 0,
          end: 733587,
          filename: '/usr/lib/tcl8.6/encoding/cp861.enc',
        },
        {
          audio: 0,
          start: 733587,
          crunched: 0,
          end: 804561,
          filename: '/usr/lib/tcl8.6/encoding/jis0212.enc',
        },
        {
          audio: 0,
          start: 804561,
          crunched: 0,
          end: 805651,
          filename: '/usr/lib/tcl8.6/encoding/cp860.enc',
        },
        {
          audio: 0,
          start: 805651,
          crunched: 0,
          end: 806742,
          filename: '/usr/lib/tcl8.6/encoding/gb1988.enc',
        },
        {
          audio: 0,
          start: 806742,
          crunched: 0,
          end: 937165,
          filename: '/usr/lib/tcl8.6/encoding/cp949.enc',
        },
        {
          audio: 0,
          start: 937165,
          crunched: 0,
          end: 938259,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-4.enc',
        },
        {
          audio: 0,
          start: 938259,
          crunched: 0,
          end: 939353,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-5.enc',
        },
        {
          audio: 0,
          start: 939353,
          crunched: 0,
          end: 940444,
          filename: '/usr/lib/tcl8.6/encoding/cp1255.enc',
        },
        {
          audio: 0,
          start: 940444,
          crunched: 0,
          end: 1026018,
          filename: '/usr/lib/tcl8.6/encoding/gb2312.enc',
        },
        {
          audio: 0,
          start: 1026018,
          crunched: 0,
          end: 1106471,
          filename: '/usr/lib/tcl8.6/encoding/jis0208.enc',
        },
        {
          audio: 0,
          start: 1106471,
          crunched: 0,
          end: 1107565,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-7.enc',
        },
        {
          audio: 0,
          start: 1107565,
          crunched: 0,
          end: 1108659,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-8.enc',
        },
        {
          audio: 0,
          start: 1108659,
          crunched: 0,
          end: 1109753,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-6.enc',
        },
        {
          audio: 0,
          start: 1109753,
          crunched: 0,
          end: 1110843,
          filename: '/usr/lib/tcl8.6/encoding/cp865.enc',
        },
        {
          audio: 0,
          start: 1110843,
          crunched: 0,
          end: 1203720,
          filename: '/usr/lib/tcl8.6/encoding/ksc5601.enc',
        },
        {
          audio: 0,
          start: 1203720,
          crunched: 0,
          end: 1204816,
          filename: '/usr/lib/tcl8.6/encoding/macCroatian.enc',
        },
        {
          audio: 0,
          start: 1204816,
          crunched: 0,
          end: 1205907,
          filename: '/usr/lib/tcl8.6/encoding/cp1257.enc',
        },
        {
          audio: 0,
          start: 1205907,
          crunched: 0,
          end: 1206997,
          filename: '/usr/lib/tcl8.6/encoding/cp862.enc',
        },
        {
          audio: 0,
          start: 1206997,
          crunched: 0,
          end: 1208089,
          filename: '/usr/lib/tcl8.6/encoding/macThai.enc',
        },
        {
          audio: 0,
          start: 1208089,
          crunched: 0,
          end: 1209183,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-9.enc',
        },
        {
          audio: 0,
          start: 1209183,
          crunched: 0,
          end: 1210278,
          filename: '/usr/lib/tcl8.6/encoding/macIceland.enc',
        },
        {
          audio: 0,
          start: 1210278,
          crunched: 0,
          end: 1211369,
          filename: '/usr/lib/tcl8.6/encoding/cp1250.enc',
        },
        {
          audio: 0,
          start: 1211369,
          crunched: 0,
          end: 1212465,
          filename: '/usr/lib/tcl8.6/encoding/macCyrillic.enc',
        },
        {
          audio: 0,
          start: 1212465,
          crunched: 0,
          end: 1254327,
          filename: '/usr/lib/tcl8.6/encoding/shiftjis.enc',
        },
        {
          audio: 0,
          start: 1254327,
          crunched: 0,
          end: 1255422,
          filename: '/usr/lib/tcl8.6/encoding/macUkraine.enc',
        },
        {
          audio: 0,
          start: 1255422,
          crunched: 0,
          end: 1256512,
          filename: '/usr/lib/tcl8.6/encoding/cp852.enc',
        },
        {
          audio: 0,
          start: 1256512,
          crunched: 0,
          end: 1257603,
          filename: '/usr/lib/tcl8.6/encoding/cp1252.enc',
        },
        {
          audio: 0,
          start: 1257603,
          crunched: 0,
          end: 1350476,
          filename: '/usr/lib/tcl8.6/encoding/big5.enc',
        },
        {
          audio: 0,
          start: 1350476,
          crunched: 0,
          end: 1351570,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-1.enc',
        },
        {
          audio: 0,
          start: 1351570,
          crunched: 0,
          end: 1436102,
          filename: '/usr/lib/tcl8.6/encoding/gb2312-raw.enc',
        },
        {
          audio: 0,
          start: 1436102,
          crunched: 0,
          end: 1437197,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-10.enc',
        },
        {
          audio: 0,
          start: 1437197,
          crunched: 0,
          end: 1438288,
          filename: '/usr/lib/tcl8.6/encoding/tis-620.enc',
        },
        {
          audio: 0,
          start: 1438288,
          crunched: 0,
          end: 1439384,
          filename: '/usr/lib/tcl8.6/encoding/macCentEuro.enc',
        },
        {
          audio: 0,
          start: 1439384,
          crunched: 0,
          end: 1487591,
          filename: '/usr/lib/tcl8.6/encoding/cp932.enc',
        },
        {
          audio: 0,
          start: 1487591,
          crunched: 0,
          end: 1488681,
          filename: '/usr/lib/tcl8.6/encoding/cp874.enc',
        },
        {
          audio: 0,
          start: 1488681,
          crunched: 0,
          end: 1575300,
          filename: '/usr/lib/tcl8.6/encoding/gb12345.enc',
        },
        {
          audio: 0,
          start: 1575300,
          crunched: 0,
          end: 1576390,
          filename: '/usr/lib/tcl8.6/encoding/cp864.enc',
        },
        {
          audio: 0,
          start: 1576390,
          crunched: 0,
          end: 1577480,
          filename: '/usr/lib/tcl8.6/encoding/cp869.enc',
        },
        {
          audio: 0,
          start: 1577480,
          crunched: 0,
          end: 1578571,
          filename: '/usr/lib/tcl8.6/encoding/cp1256.enc',
        },
        {
          audio: 0,
          start: 1578571,
          crunched: 0,
          end: 1579662,
          filename: '/usr/lib/tcl8.6/encoding/koi8-u.enc',
        },
        {
          audio: 0,
          start: 1579662,
          crunched: 0,
          end: 1580757,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-15.enc',
        },
        {
          audio: 0,
          start: 1580757,
          crunched: 0,
          end: 1713266,
          filename: '/usr/lib/tcl8.6/encoding/cp936.enc',
        },
        {
          audio: 0,
          start: 1713266,
          crunched: 0,
          end: 1761294,
          filename: '/usr/lib/tcl8.6/encoding/macJapan.enc',
        },
        {
          audio: 0,
          start: 1761294,
          crunched: 0,
          end: 1762384,
          filename: '/usr/lib/tcl8.6/encoding/ascii.enc',
        },
        {
          audio: 0,
          start: 1762384,
          crunched: 0,
          end: 1854215,
          filename: '/usr/lib/tcl8.6/encoding/cp950.enc',
        },
        {
          audio: 0,
          start: 1854215,
          crunched: 0,
          end: 1855310,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-13.enc',
        },
        {
          audio: 0,
          start: 1855310,
          crunched: 0,
          end: 1856401,
          filename: '/usr/lib/tcl8.6/encoding/cp1258.enc',
        },
        {
          audio: 0,
          start: 1856401,
          crunched: 0,
          end: 1857491,
          filename: '/usr/lib/tcl8.6/encoding/cp857.enc',
        },
        {
          audio: 0,
          start: 1857491,
          crunched: 0,
          end: 1858586,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-14.enc',
        },
        {
          audio: 0,
          start: 1858586,
          crunched: 0,
          end: 1859676,
          filename: '/usr/lib/tcl8.6/encoding/cp737.enc',
        },
        {
          audio: 0,
          start: 1859676,
          crunched: 0,
          end: 1860771,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-16.enc',
        },
        {
          audio: 0,
          start: 1860771,
          crunched: 0,
          end: 1861825,
          filename: '/usr/lib/tcl8.6/encoding/ebcdic.enc',
        },
        {
          audio: 0,
          start: 1861825,
          crunched: 0,
          end: 1862915,
          filename: '/usr/lib/tcl8.6/encoding/cp855.enc',
        },
        {
          audio: 0,
          start: 1862915,
          crunched: 0,
          end: 1864008,
          filename: '/usr/lib/tcl8.6/encoding/macGreek.enc',
        },
        {
          audio: 0,
          start: 1864008,
          crunched: 0,
          end: 1865101,
          filename: '/usr/lib/tcl8.6/encoding/dingbats.enc',
        },
        {
          audio: 0,
          start: 1865101,
          crunched: 0,
          end: 1865327,
          filename: '/usr/lib/tcl8.6/encoding/iso2022.enc',
        },
        {
          audio: 0,
          start: 1865327,
          crunched: 0,
          end: 1866417,
          filename: '/usr/lib/tcl8.6/encoding/cp437.enc',
        },
        {
          audio: 0,
          start: 1866417,
          crunched: 0,
          end: 1867508,
          filename: '/usr/lib/tcl8.6/encoding/symbol.enc',
        },
        {
          audio: 0,
          start: 1867508,
          crunched: 0,
          end: 1950045,
          filename: '/usr/lib/tcl8.6/encoding/euc-jp.enc',
        },
        {
          audio: 0,
          start: 1950045,
          crunched: 0,
          end: 1950160,
          filename: '/usr/lib/tcl8.6/encoding/iso2022-kr.enc',
        },
        {
          audio: 0,
          start: 1950160,
          crunched: 0,
          end: 1951254,
          filename: '/usr/lib/tcl8.6/encoding/iso8859-3.enc',
        },
        {
          audio: 0,
          start: 1951254,
          crunched: 0,
          end: 1952346,
          filename: '/usr/lib/tcl8.6/encoding/jis0201.enc',
        },
        {
          audio: 0,
          start: 1952346,
          crunched: 0,
          end: 1985064,
          filename: '/usr/lib/tcl8.6/opt0.4/optparse.tcl',
        },
        {
          audio: 0,
          start: 1985064,
          crunched: 0,
          end: 1985671,
          filename: '/usr/lib/tcl8.6/opt0.4/pkgIndex.tcl',
        },
        {
          audio: 0,
          start: 1985671,
          crunched: 0,
          end: 1985922,
          filename: '/usr/lib/tcl8.6/msgs/es_py.msg',
        },
        {
          audio: 0,
          start: 1985922,
          crunched: 0,
          end: 1987102,
          filename: '/usr/lib/tcl8.6/msgs/es.msg',
        },
        {
          audio: 0,
          start: 1987102,
          crunched: 0,
          end: 1989137,
          filename: '/usr/lib/tcl8.6/msgs/sr.msg',
        },
        {
          audio: 0,
          start: 1989137,
          crunched: 0,
          end: 1989379,
          filename: '/usr/lib/tcl8.6/msgs/ru_ua.msg',
        },
        {
          audio: 0,
          start: 1989379,
          crunched: 0,
          end: 1989633,
          filename: '/usr/lib/tcl8.6/msgs/kok_in.msg',
        },
        {
          audio: 0,
          start: 1989633,
          crunched: 0,
          end: 1991597,
          filename: '/usr/lib/tcl8.6/msgs/ar.msg',
        },
        {
          audio: 0,
          start: 1991597,
          crunched: 0,
          end: 1992816,
          filename: '/usr/lib/tcl8.6/msgs/lv.msg',
        },
        {
          audio: 0,
          start: 1992816,
          crunched: 0,
          end: 1993067,
          filename: '/usr/lib/tcl8.6/msgs/es_co.msg',
        },
        {
          audio: 0,
          start: 1993067,
          crunched: 0,
          end: 1994052,
          filename: '/usr/lib/tcl8.6/msgs/eu.msg',
        },
        {
          audio: 0,
          start: 1994052,
          crunched: 0,
          end: 1996157,
          filename: '/usr/lib/tcl8.6/msgs/be.msg',
        },
        {
          audio: 0,
          start: 1996157,
          crunched: 0,
          end: 1996457,
          filename: '/usr/lib/tcl8.6/msgs/en_nz.msg',
        },
        {
          audio: 0,
          start: 1996457,
          crunched: 0,
          end: 1997371,
          filename: '/usr/lib/tcl8.6/msgs/id.msg',
        },
        {
          audio: 0,
          start: 1997371,
          crunched: 0,
          end: 1998527,
          filename: '/usr/lib/tcl8.6/msgs/da.msg',
        },
        {
          audio: 0,
          start: 1998527,
          crunched: 0,
          end: 1998778,
          filename: '/usr/lib/tcl8.6/msgs/es_pr.msg',
        },
        {
          audio: 0,
          start: 1998778,
          crunched: 0,
          end: 2000817,
          filename: '/usr/lib/tcl8.6/msgs/ru.msg',
        },
        {
          audio: 0,
          start: 2000817,
          crunched: 0,
          end: 2001068,
          filename: '/usr/lib/tcl8.6/msgs/hi_in.msg',
        },
        {
          audio: 0,
          start: 2001068,
          crunched: 0,
          end: 2002189,
          filename: '/usr/lib/tcl8.6/msgs/hr.msg',
        },
        {
          audio: 0,
          start: 2002189,
          crunched: 0,
          end: 2002440,
          filename: '/usr/lib/tcl8.6/msgs/en_sg.msg',
        },
        {
          audio: 0,
          start: 2002440,
          crunched: 0,
          end: 2003662,
          filename: '/usr/lib/tcl8.6/msgs/de.msg',
        },
        {
          audio: 0,
          start: 2003662,
          crunched: 0,
          end: 2003904,
          filename: '/usr/lib/tcl8.6/msgs/es_ar.msg',
        },
        {
          audio: 0,
          start: 2003904,
          crunched: 0,
          end: 2004155,
          filename: '/usr/lib/tcl8.6/msgs/es_ve.msg',
        },
        {
          audio: 0,
          start: 2004155,
          crunched: 0,
          end: 2006460,
          filename: '/usr/lib/tcl8.6/msgs/th.msg',
        },
        {
          audio: 0,
          start: 2006460,
          crunched: 0,
          end: 2008712,
          filename: '/usr/lib/tcl8.6/msgs/el.msg',
        },
        {
          audio: 0,
          start: 2008712,
          crunched: 0,
          end: 2008991,
          filename: '/usr/lib/tcl8.6/msgs/ga_ie.msg',
        },
        {
          audio: 0,
          start: 2008991,
          crunched: 0,
          end: 2009270,
          filename: '/usr/lib/tcl8.6/msgs/nl_be.msg',
        },
        {
          audio: 0,
          start: 2009270,
          crunched: 0,
          end: 2010501,
          filename: '/usr/lib/tcl8.6/msgs/eo.msg',
        },
        {
          audio: 0,
          start: 2010501,
          crunched: 0,
          end: 2010782,
          filename: '/usr/lib/tcl8.6/msgs/fr_ch.msg',
        },
        {
          audio: 0,
          start: 2010782,
          crunched: 0,
          end: 2011033,
          filename: '/usr/lib/tcl8.6/msgs/es_ec.msg',
        },
        {
          audio: 0,
          start: 2011033,
          crunched: 0,
          end: 2012845,
          filename: '/usr/lib/tcl8.6/msgs/ar_lb.msg',
        },
        {
          audio: 0,
          start: 2012845,
          crunched: 0,
          end: 2013262,
          filename: '/usr/lib/tcl8.6/msgs/fa_ir.msg',
        },
        {
          audio: 0,
          start: 2013262,
          crunched: 0,
          end: 2015069,
          filename: '/usr/lib/tcl8.6/msgs/mr.msg',
        },
        {
          audio: 0,
          start: 2015069,
          crunched: 0,
          end: 2015348,
          filename: '/usr/lib/tcl8.6/msgs/en_ie.msg',
        },
        {
          audio: 0,
          start: 2015348,
          crunched: 0,
          end: 2016450,
          filename: '/usr/lib/tcl8.6/msgs/ca.msg',
        },
        {
          audio: 0,
          start: 2016450,
          crunched: 0,
          end: 2017140,
          filename: '/usr/lib/tcl8.6/msgs/mt.msg',
        },
        {
          audio: 0,
          start: 2017140,
          crunched: 0,
          end: 2018975,
          filename: '/usr/lib/tcl8.6/msgs/ta.msg',
        },
        {
          audio: 0,
          start: 2018975,
          crunched: 0,
          end: 2019226,
          filename: '/usr/lib/tcl8.6/msgs/es_do.msg',
        },
        {
          audio: 0,
          start: 2019226,
          crunched: 0,
          end: 2020431,
          filename: '/usr/lib/tcl8.6/msgs/fr.msg',
        },
        {
          audio: 0,
          start: 2020431,
          crunched: 0,
          end: 2020682,
          filename: '/usr/lib/tcl8.6/msgs/mr_in.msg',
        },
        {
          audio: 0,
          start: 2020682,
          crunched: 0,
          end: 2021668,
          filename: '/usr/lib/tcl8.6/msgs/fo.msg',
        },
        {
          audio: 0,
          start: 2021668,
          crunched: 0,
          end: 2022747,
          filename: '/usr/lib/tcl8.6/msgs/nl.msg',
        },
        {
          audio: 0,
          start: 2022747,
          crunched: 0,
          end: 2024002,
          filename: '/usr/lib/tcl8.6/msgs/is.msg',
        },
        {
          audio: 0,
          start: 2024002,
          crunched: 0,
          end: 2025242,
          filename: '/usr/lib/tcl8.6/msgs/it.msg',
        },
        {
          audio: 0,
          start: 2025242,
          crunched: 0,
          end: 2027054,
          filename: '/usr/lib/tcl8.6/msgs/ar_sy.msg',
        },
        {
          audio: 0,
          start: 2027054,
          crunched: 0,
          end: 2027305,
          filename: '/usr/lib/tcl8.6/msgs/id_id.msg',
        },
        {
          audio: 0,
          start: 2027305,
          crunched: 0,
          end: 2027556,
          filename: '/usr/lib/tcl8.6/msgs/es_ni.msg',
        },
        {
          audio: 0,
          start: 2027556,
          crunched: 0,
          end: 2028728,
          filename: '/usr/lib/tcl8.6/msgs/ro.msg',
        },
        {
          audio: 0,
          start: 2028728,
          crunched: 0,
          end: 2029951,
          filename: '/usr/lib/tcl8.6/msgs/de_be.msg',
        },
        {
          audio: 0,
          start: 2029951,
          crunched: 0,
          end: 2031218,
          filename: '/usr/lib/tcl8.6/msgs/sq.msg',
        },
        {
          audio: 0,
          start: 2031218,
          crunched: 0,
          end: 2033176,
          filename: '/usr/lib/tcl8.6/msgs/kok.msg',
        },
        {
          audio: 0,
          start: 2033176,
          crunched: 0,
          end: 2034336,
          filename: '/usr/lib/tcl8.6/msgs/sh.msg',
        },
        {
          audio: 0,
          start: 2034336,
          crunched: 0,
          end: 2034636,
          filename: '/usr/lib/tcl8.6/msgs/en_au.msg',
        },
        {
          audio: 0,
          start: 2034636,
          crunched: 0,
          end: 2034887,
          filename: '/usr/lib/tcl8.6/msgs/gv_gb.msg',
        },
        {
          audio: 0,
          start: 2034887,
          crunched: 0,
          end: 2035138,
          filename: '/usr/lib/tcl8.6/msgs/es_bo.msg',
        },
        {
          audio: 0,
          start: 2035138,
          crunched: 0,
          end: 2035425,
          filename: '/usr/lib/tcl8.6/msgs/eu_es.msg',
        },
        {
          audio: 0,
          start: 2035425,
          crunched: 0,
          end: 2035771,
          filename: '/usr/lib/tcl8.6/msgs/ko_kr.msg',
        },
        {
          audio: 0,
          start: 2035771,
          crunched: 0,
          end: 2036916,
          filename: '/usr/lib/tcl8.6/msgs/fi.msg',
        },
        {
          audio: 0,
          start: 2036916,
          crunched: 0,
          end: 2037907,
          filename: '/usr/lib/tcl8.6/msgs/sw.msg',
        },
        {
          audio: 0,
          start: 2037907,
          crunched: 0,
          end: 2039207,
          filename: '/usr/lib/tcl8.6/msgs/cs.msg',
        },
        {
          audio: 0,
          start: 2039207,
          crunched: 0,
          end: 2039466,
          filename: '/usr/lib/tcl8.6/msgs/ar_in.msg',
        },
        {
          audio: 0,
          start: 2039466,
          crunched: 0,
          end: 2039745,
          filename: '/usr/lib/tcl8.6/msgs/en_gb.msg',
        },
        {
          audio: 0,
          start: 2039745,
          crunched: 0,
          end: 2041409,
          filename: '/usr/lib/tcl8.6/msgs/fa.msg',
        },
        {
          audio: 0,
          start: 2041409,
          crunched: 0,
          end: 2043228,
          filename: '/usr/lib/tcl8.6/msgs/bg.msg',
        },
        {
          audio: 0,
          start: 2043228,
          crunched: 0,
          end: 2043507,
          filename: '/usr/lib/tcl8.6/msgs/fr_be.msg',
        },
        {
          audio: 0,
          start: 2043507,
          crunched: 0,
          end: 2044473,
          filename: '/usr/lib/tcl8.6/msgs/kw.msg',
        },
        {
          audio: 0,
          start: 2044473,
          crunched: 0,
          end: 2045614,
          filename: '/usr/lib/tcl8.6/msgs/ga.msg',
        },
        {
          audio: 0,
          start: 2045614,
          crunched: 0,
          end: 2045893,
          filename: '/usr/lib/tcl8.6/msgs/kl_gl.msg',
        },
        {
          audio: 0,
          start: 2045893,
          crunched: 0,
          end: 2047220,
          filename: '/usr/lib/tcl8.6/msgs/hu.msg',
        },
        {
          audio: 0,
          start: 2047220,
          crunched: 0,
          end: 2047471,
          filename: '/usr/lib/tcl8.6/msgs/gl_es.msg',
        },
        {
          audio: 0,
          start: 2047471,
          crunched: 0,
          end: 2047722,
          filename: '/usr/lib/tcl8.6/msgs/es_mx.msg',
        },
        {
          audio: 0,
          start: 2047722,
          crunched: 0,
          end: 2047966,
          filename: '/usr/lib/tcl8.6/msgs/it_ch.msg',
        },
        {
          audio: 0,
          start: 2047966,
          crunched: 0,
          end: 2049130,
          filename: '/usr/lib/tcl8.6/msgs/sl.msg',
        },
        {
          audio: 0,
          start: 2049130,
          crunched: 0,
          end: 2049381,
          filename: '/usr/lib/tcl8.6/msgs/es_hn.msg',
        },
        {
          audio: 0,
          start: 2049381,
          crunched: 0,
          end: 2051319,
          filename: '/usr/lib/tcl8.6/msgs/he.msg',
        },
        {
          audio: 0,
          start: 2051319,
          crunched: 0,
          end: 2052452,
          filename: '/usr/lib/tcl8.6/msgs/tr.msg',
        },
        {
          audio: 0,
          start: 2052452,
          crunched: 0,
          end: 2053579,
          filename: '/usr/lib/tcl8.6/msgs/pt.msg',
        },
        {
          audio: 0,
          start: 2053579,
          crunched: 0,
          end: 2053867,
          filename: '/usr/lib/tcl8.6/msgs/en_ca.msg',
        },
        {
          audio: 0,
          start: 2053867,
          crunched: 0,
          end: 2055824,
          filename: '/usr/lib/tcl8.6/msgs/fa_in.msg',
        },
        {
          audio: 0,
          start: 2055824,
          crunched: 0,
          end: 2056083,
          filename: '/usr/lib/tcl8.6/msgs/bn_in.msg',
        },
        {
          audio: 0,
          start: 2056083,
          crunched: 0,
          end: 2056835,
          filename: '/usr/lib/tcl8.6/msgs/zh_hk.msg',
        },
        {
          audio: 0,
          start: 2056835,
          crunched: 0,
          end: 2057246,
          filename: '/usr/lib/tcl8.6/msgs/te_in.msg',
        },
        {
          audio: 0,
          start: 2057246,
          crunched: 0,
          end: 2058413,
          filename: '/usr/lib/tcl8.6/msgs/sv.msg',
        },
        {
          audio: 0,
          start: 2058413,
          crunched: 0,
          end: 2059619,
          filename: '/usr/lib/tcl8.6/msgs/et.msg',
        },
        {
          audio: 0,
          start: 2059619,
          crunched: 0,
          end: 2059870,
          filename: '/usr/lib/tcl8.6/msgs/es_pe.msg',
        },
        {
          audio: 0,
          start: 2059870,
          crunched: 0,
          end: 2060121,
          filename: '/usr/lib/tcl8.6/msgs/es_sv.msg',
        },
        {
          audio: 0,
          start: 2060121,
          crunched: 0,
          end: 2061099,
          filename: '/usr/lib/tcl8.6/msgs/kl.msg',
        },
        {
          audio: 0,
          start: 2061099,
          crunched: 0,
          end: 2061350,
          filename: '/usr/lib/tcl8.6/msgs/ta_in.msg',
        },
        {
          audio: 0,
          start: 2061350,
          crunched: 0,
          end: 2062553,
          filename: '/usr/lib/tcl8.6/msgs/sk.msg',
        },
        {
          audio: 0,
          start: 2062553,
          crunched: 0,
          end: 2062892,
          filename: '/usr/lib/tcl8.6/msgs/zh_sg.msg',
        },
        {
          audio: 0,
          start: 2062892,
          crunched: 0,
          end: 2063881,
          filename: '/usr/lib/tcl8.6/msgs/af.msg',
        },
        {
          audio: 0,
          start: 2063881,
          crunched: 0,
          end: 2064132,
          filename: '/usr/lib/tcl8.6/msgs/kw_gb.msg',
        },
        {
          audio: 0,
          start: 2064132,
          crunched: 0,
          end: 2064383,
          filename: '/usr/lib/tcl8.6/msgs/es_cl.msg',
        },
        {
          audio: 0,
          start: 2064383,
          crunched: 0,
          end: 2064704,
          filename: '/usr/lib/tcl8.6/msgs/en_ph.msg',
        },
        {
          audio: 0,
          start: 2064704,
          crunched: 0,
          end: 2066809,
          filename: '/usr/lib/tcl8.6/msgs/mk.msg',
        },
        {
          audio: 0,
          start: 2066809,
          crunched: 0,
          end: 2068230,
          filename: '/usr/lib/tcl8.6/msgs/vi.msg',
        },
        {
          audio: 0,
          start: 2068230,
          crunched: 0,
          end: 2068509,
          filename: '/usr/lib/tcl8.6/msgs/fr_ca.msg',
        },
        {
          audio: 0,
          start: 2068509,
          crunched: 0,
          end: 2068821,
          filename: '/usr/lib/tcl8.6/msgs/zh_cn.msg',
        },
        {
          audio: 0,
          start: 2068821,
          crunched: 0,
          end: 2070076,
          filename: '/usr/lib/tcl8.6/msgs/lt.msg',
        },
        {
          audio: 0,
          start: 2070076,
          crunched: 0,
          end: 2070355,
          filename: '/usr/lib/tcl8.6/msgs/pt_br.msg',
        },
        {
          audio: 0,
          start: 2070355,
          crunched: 0,
          end: 2072641,
          filename: '/usr/lib/tcl8.6/msgs/bn.msg',
        },
        {
          audio: 0,
          start: 2072641,
          crunched: 0,
          end: 2074453,
          filename: '/usr/lib/tcl8.6/msgs/ar_jo.msg',
        },
        {
          audio: 0,
          start: 2074453,
          crunched: 0,
          end: 2074758,
          filename: '/usr/lib/tcl8.6/msgs/en_be.msg',
        },
        {
          audio: 0,
          start: 2074758,
          crunched: 0,
          end: 2075009,
          filename: '/usr/lib/tcl8.6/msgs/en_zw.msg',
        },
        {
          audio: 0,
          start: 2075009,
          crunched: 0,
          end: 2077111,
          filename: '/usr/lib/tcl8.6/msgs/te.msg',
        },
        {
          audio: 0,
          start: 2077111,
          crunched: 0,
          end: 2078322,
          filename: '/usr/lib/tcl8.6/msgs/pl.msg',
        },
        {
          audio: 0,
          start: 2078322,
          crunched: 0,
          end: 2079359,
          filename: '/usr/lib/tcl8.6/msgs/gv.msg',
        },
        {
          audio: 0,
          start: 2079359,
          crunched: 0,
          end: 2081472,
          filename: '/usr/lib/tcl8.6/msgs/uk.msg',
        },
        {
          audio: 0,
          start: 2081472,
          crunched: 0,
          end: 2081723,
          filename: '/usr/lib/tcl8.6/msgs/af_za.msg',
        },
        {
          audio: 0,
          start: 2081723,
          crunched: 0,
          end: 2083387,
          filename: '/usr/lib/tcl8.6/msgs/ja.msg',
        },
        {
          audio: 0,
          start: 2083387,
          crunched: 0,
          end: 2084953,
          filename: '/usr/lib/tcl8.6/msgs/ko.msg',
        },
        {
          audio: 0,
          start: 2084953,
          crunched: 0,
          end: 2085204,
          filename: '/usr/lib/tcl8.6/msgs/es_gt.msg',
        },
        {
          audio: 0,
          start: 2085204,
          crunched: 0,
          end: 2086361,
          filename: '/usr/lib/tcl8.6/msgs/nb.msg',
        },
        {
          audio: 0,
          start: 2086361,
          crunched: 0,
          end: 2086620,
          filename: '/usr/lib/tcl8.6/msgs/ms_my.msg',
        },
        {
          audio: 0,
          start: 2086620,
          crunched: 0,
          end: 2086871,
          filename: '/usr/lib/tcl8.6/msgs/es_cr.msg',
        },
        {
          audio: 0,
          start: 2086871,
          crunched: 0,
          end: 2087217,
          filename: '/usr/lib/tcl8.6/msgs/zh_tw.msg',
        },
        {
          audio: 0,
          start: 2087217,
          crunched: 0,
          end: 2090547,
          filename: '/usr/lib/tcl8.6/msgs/zh.msg',
        },
        {
          audio: 0,
          start: 2090547,
          crunched: 0,
          end: 2091497,
          filename: '/usr/lib/tcl8.6/msgs/gl.msg',
        },
        {
          audio: 0,
          start: 2091497,
          crunched: 0,
          end: 2091742,
          filename: '/usr/lib/tcl8.6/msgs/en_za.msg',
        },
        {
          audio: 0,
          start: 2091742,
          crunched: 0,
          end: 2091993,
          filename: '/usr/lib/tcl8.6/msgs/en_bw.msg',
        },
        {
          audio: 0,
          start: 2091993,
          crunched: 0,
          end: 2092314,
          filename: '/usr/lib/tcl8.6/msgs/en_hk.msg',
        },
        {
          audio: 0,
          start: 2092314,
          crunched: 0,
          end: 2093126,
          filename: '/usr/lib/tcl8.6/msgs/de_at.msg',
        },
        {
          audio: 0,
          start: 2093126,
          crunched: 0,
          end: 2094036,
          filename: '/usr/lib/tcl8.6/msgs/ms.msg',
        },
        {
          audio: 0,
          start: 2094036,
          crunched: 0,
          end: 2094315,
          filename: '/usr/lib/tcl8.6/msgs/fo_fo.msg',
        },
        {
          audio: 0,
          start: 2094315,
          crunched: 0,
          end: 2094566,
          filename: '/usr/lib/tcl8.6/msgs/es_pa.msg',
        },
        {
          audio: 0,
          start: 2094566,
          crunched: 0,
          end: 2095714,
          filename: '/usr/lib/tcl8.6/msgs/nn.msg',
        },
        {
          audio: 0,
          start: 2095714,
          crunched: 0,
          end: 2095965,
          filename: '/usr/lib/tcl8.6/msgs/es_uy.msg',
        },
        {
          audio: 0,
          start: 2095965,
          crunched: 0,
          end: 2097703,
          filename: '/usr/lib/tcl8.6/msgs/hi.msg',
        },
        {
          audio: 0,
          start: 2097703,
          crunched: 0,
          end: 2098013,
          filename: '/usr/lib/tcl8.6/msgs/en_in.msg',
        },
        {
          audio: 0,
          start: 2098013,
          crunched: 0,
          end: 2101584,
          filename: '/usr/lib/fileutil/decode.tcl',
        },
        {
          audio: 0,
          start: 2101584,
          crunched: 0,
          end: 2102186,
          filename: '/usr/lib/fileutil/pkgIndex.tcl',
        },
        {
          audio: 0,
          start: 2102186,
          crunched: 0,
          end: 2102860,
          filename: '/usr/lib/fileutil/multi.tcl',
        },
        {
          audio: 0,
          start: 2102860,
          crunched: 0,
          end: 2118324,
          filename: '/usr/lib/fileutil/traverse.tcl',
        },
        {
          audio: 0,
          start: 2118324,
          crunched: 0,
          end: 2182288,
          filename: '/usr/lib/fileutil/fileutil.tcl',
        },
        {
          audio: 0,
          start: 2182288,
          crunched: 0,
          end: 2198697,
          filename: '/usr/lib/fileutil/multiop.tcl',
        },
        {
          audio: 0,
          start: 2198697,
          crunched: 0,
          end: 2198827,
          filename: '/usr/lib/ncgi/pkgIndex.tcl',
        },
        { audio: 0, start: 2198827, crunched: 0, end: 2229061, filename: '/usr/lib/ncgi/ncgi.tcl' },
        {
          audio: 0,
          start: 2229061,
          crunched: 0,
          end: 2229299,
          filename: '/usr/lib/uri/pkgIndex.tcl',
        },
        { audio: 0, start: 2229299, crunched: 0, end: 2258625, filename: '/usr/lib/uri/uri.tcl' },
        {
          audio: 0,
          start: 2258625,
          crunched: 0,
          end: 2263420,
          filename: '/usr/lib/uri/urn-scheme.tcl',
        },
        {
          audio: 0,
          start: 2263420,
          crunched: 0,
          end: 2263554,
          filename: '/usr/lib/cmdline/pkgIndex.tcl',
        },
        {
          audio: 0,
          start: 2263554,
          crunched: 0,
          end: 2294139,
          filename: '/usr/lib/cmdline/cmdline.tcl',
        },
        {
          audio: 0,
          start: 2294139,
          crunched: 0,
          end: 2294318,
          filename: '/usr/lib/javascript/pkgIndex.tcl',
        },
        {
          audio: 0,
          start: 2294318,
          crunched: 0,
          end: 2307994,
          filename: '/usr/lib/javascript/javascript.tcl',
        },
      ],
      remote_package_size: 2307994,
      package_uuid: '42fb4dca-c581-44b5-b3e4-d4d903da797d',
    });
  })();
  if (!Module.expectedDataFileDownloads) {
    Module.expectedDataFileDownloads = 0;
    Module.finishedDataFileDownloads = 0;
  }
  Module.expectedDataFileDownloads++;
  (function () {
    var loadPackage = function (metadata) {
      var PACKAGE_PATH;
      if (typeof window === 'object') {
        PACKAGE_PATH = window['encodeURIComponent'](
          window.location.pathname
            .toString()
            .substring(0, window.location.pathname.toString().lastIndexOf('/')) + '/',
        );
      } else if (typeof location !== 'undefined') {
        PACKAGE_PATH = encodeURIComponent(
          location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf('/')) +
            '/',
        );
      } else {
        throw 'using preloaded data can only be done on a web page or in a web worker';
      }
      var PACKAGE_NAME = 'wacl-custom.data';
      var REMOTE_PACKAGE_BASE = 'wacl-custom.data';
      if (typeof Module['locateFilePackage'] === 'function' && !Module['locateFile']) {
        Module['locateFile'] = Module['locateFilePackage'];
        Module.printErr(
          'warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)',
        );
      }
      var REMOTE_PACKAGE_NAME =
        typeof Module['locateFile'] === 'function'
          ? Module['locateFile'](REMOTE_PACKAGE_BASE)
          : (Module['filePackagePrefixURL'] || '') + REMOTE_PACKAGE_BASE;
      var REMOTE_PACKAGE_SIZE = metadata.remote_package_size;
      var PACKAGE_UUID = metadata.package_uuid;
      function fetchRemotePackage(packageName, packageSize, callback, errback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', packageName, true);
        xhr.responseType = 'arraybuffer';
        xhr.onprogress = function (event) {
          var url = packageName;
          var size = packageSize;
          if (event.total) size = event.total;
          if (event.loaded) {
            if (!xhr.addedTotal) {
              xhr.addedTotal = true;
              if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
              Module.dataFileDownloads[url] = { loaded: event.loaded, total: size };
            } else {
              Module.dataFileDownloads[url].loaded = event.loaded;
            }
            var total = 0;
            var loaded = 0;
            var num = 0;
            for (var download in Module.dataFileDownloads) {
              var data = Module.dataFileDownloads[download];
              total += data.total;
              loaded += data.loaded;
              num++;
            }
            total = Math.ceil((total * Module.expectedDataFileDownloads) / num);
            if (Module['setStatus'])
              Module['setStatus']('Downloading data... (' + loaded + '/' + total + ')');
          } else if (!Module.dataFileDownloads) {
            if (Module['setStatus']) Module['setStatus']('Downloading data...');
          }
        };
        xhr.onerror = function (event) {
          throw new Error('NetworkError for: ' + packageName);
        };
        xhr.onload = function (event) {
          if (
            xhr.status == 200 ||
            xhr.status == 304 ||
            xhr.status == 206 ||
            (xhr.status == 0 && xhr.response)
          ) {
            var packageData = xhr.response;
            callback(packageData);
          } else {
            throw new Error(xhr.statusText + ' : ' + xhr.responseURL);
          }
        };
        xhr.send(null);
      }
      function handleError(error) {
        console.error('package error:', error);
      }
      var fetchedCallback = null;
      var fetched = Module['getPreloadedPackage']
        ? Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE)
        : null;
      if (!fetched)
        fetchRemotePackage(
          REMOTE_PACKAGE_NAME,
          REMOTE_PACKAGE_SIZE,
          function (data) {
            if (fetchedCallback) {
              fetchedCallback(data);
              fetchedCallback = null;
            } else {
              fetched = data;
            }
          },
          handleError,
        );
      function runWithFS() {
        function assert(check, msg) {
          if (!check) throw msg + new Error().stack;
        }
        Module['FS_createPath']('/', 'usr', true, true);
        Module['FS_createPath']('/usr', 'lib', true, true);
        function DataRequest(start, end, crunched, audio) {
          this.start = start;
          this.end = end;
          this.crunched = crunched;
          this.audio = audio;
        }
        DataRequest.prototype = {
          requests: {},
          open: function (mode, name) {
            this.name = name;
            this.requests[name] = this;
            Module['addRunDependency']('fp ' + this.name);
          },
          send: function () {},
          onload: function () {
            var byteArray = this.byteArray.subarray(this.start, this.end);
            this.finish(byteArray);
          },
          finish: function (byteArray) {
            var that = this;
            Module['FS_createDataFile'](this.name, null, byteArray, true, true, true);
            Module['removeRunDependency']('fp ' + that.name);
            this.requests[this.name] = null;
          },
        };
        var files = metadata.files;
        for (let i = 0; i < files.length; ++i) {
          new DataRequest(files[i].start, files[i].end, files[i].crunched, files[i].audio).open(
            'GET',
            files[i].filename,
          );
        }
        function processPackageData(arrayBuffer) {
          Module.finishedDataFileDownloads++;
          assert(arrayBuffer, 'Loading data file failed.');
          assert(arrayBuffer instanceof ArrayBuffer, 'bad input to processPackageData');
          var byteArray = new Uint8Array(arrayBuffer);
          if (Module['SPLIT_MEMORY'])
            Module.printErr(
              'warning: you should run the file packager with --no-heap-copy when SPLIT_MEMORY is used, otherwise copying into the heap may fail due to the splitting',
            );
          var ptr = Module['getMemory'](byteArray.length);
          Module['HEAPU8'].set(byteArray, ptr);
          DataRequest.prototype.byteArray = Module['HEAPU8'].subarray(ptr, ptr + byteArray.length);
          var files = metadata.files;
          for (let i = 0; i < files.length; ++i) {
            DataRequest.prototype.requests[files[i].filename].onload();
          }
          Module['removeRunDependency']('datafile_wacl-custom.data');
        }
        Module['addRunDependency']('datafile_wacl-custom.data');
        if (!Module.preloadResults) Module.preloadResults = {};
        Module.preloadResults[PACKAGE_NAME] = { fromCache: false };
        if (fetched) {
          processPackageData(fetched);
          fetched = null;
        } else {
          fetchedCallback = processPackageData;
        }
      }
      if (Module['calledRun']) {
        runWithFS();
      } else {
        if (!Module['preRun']) Module['preRun'] = [];
        Module['preRun'].push(runWithFS);
      }
    };
    loadPackage({
      files: [{ audio: 0, start: 0, crunched: 0, end: 976, filename: '/usr/lib/README' }],
      remote_package_size: 976,
      package_uuid: 'ee5d873a-5255-473a-ba79-a64058b1bd07',
    });
  })();
  var Module;
  if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};
  var moduleOverrides = {};
  for (var key in Module) {
    if (Module.hasOwnProperty(key)) {
      moduleOverrides[key] = Module[key];
    }
  }
  var ENVIRONMENT_IS_WEB = false;
  var ENVIRONMENT_IS_WORKER = false;
  var ENVIRONMENT_IS_NODE = false;
  var ENVIRONMENT_IS_SHELL = false;
  if (Module['ENVIRONMENT']) {
    if (Module['ENVIRONMENT'] === 'WEB') {
      ENVIRONMENT_IS_WEB = true;
    } else if (Module['ENVIRONMENT'] === 'WORKER') {
      ENVIRONMENT_IS_WORKER = true;
    } else if (Module['ENVIRONMENT'] === 'NODE') {
      ENVIRONMENT_IS_NODE = true;
    } else if (Module['ENVIRONMENT'] === 'SHELL') {
      ENVIRONMENT_IS_SHELL = true;
    } else {
      throw new Error(
        "The provided Module['ENVIRONMENT'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.",
      );
    }
  } else {
    ENVIRONMENT_IS_WEB = typeof window === 'object';
    ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
    ENVIRONMENT_IS_NODE =
      typeof process === 'object' &&
      typeof require === 'function' &&
      !ENVIRONMENT_IS_WEB &&
      !ENVIRONMENT_IS_WORKER;
    ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
  }
  if (ENVIRONMENT_IS_NODE) {
    if (!Module['print']) Module['print'] = console.log;
    if (!Module['printErr']) Module['printErr'] = console.warn;
    var nodeFS;
    var nodePath;
    Module['read'] = function read(filename, binary) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      var ret = nodeFS['readFileSync'](filename);
      return binary ? ret : ret.toString();
    };
    Module['readBinary'] = function readBinary(filename) {
      var ret = Module['read'](filename, true);
      if (!ret.buffer) {
        ret = new Uint8Array(ret);
      }
      assert(ret.buffer);
      return ret;
    };
    Module['load'] = function load(f) {
      globalEval(read(f));
    };
    if (!Module['thisProgram']) {
      if (process['argv'].length > 1) {
        Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
      } else {
        Module['thisProgram'] = 'unknown-program';
      }
    }
    Module['arguments'] = process['argv'].slice(2);
    if (typeof module !== 'undefined') {
      module['exports'] = Module;
    }
    process['on']('uncaughtException', function (ex) {
      if (!(ex instanceof ExitStatus)) {
        throw ex;
      }
    });
    Module['inspect'] = function () {
      return '[Emscripten Module object]';
    };
  } else if (ENVIRONMENT_IS_SHELL) {
    if (!Module['print']) Module['print'] = print;
    if (typeof printErr != 'undefined') Module['printErr'] = printErr;
    if (typeof read != 'undefined') {
      Module['read'] = read;
    } else {
      Module['read'] = function read() {
        throw 'no read() available';
      };
    }
    Module['readBinary'] = function readBinary(f) {
      if (typeof readbuffer === 'function') {
        return new Uint8Array(readbuffer(f));
      }
      var data = read(f, 'binary');
      assert(typeof data === 'object');
      return data;
    };
    if (typeof scriptArgs != 'undefined') {
      Module['arguments'] = scriptArgs;
    } else if (typeof arguments != 'undefined') {
      Module['arguments'] = arguments;
    }
    if (typeof quit === 'function') {
      Module['quit'] = function (status, toThrow) {
        quit(status);
      };
    }
  } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    Module['read'] = function read(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    };
    if (ENVIRONMENT_IS_WORKER) {
      Module['readBinary'] = function read(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return xhr.response;
      };
    }
    Module['readAsync'] = function readAsync(url, onload, onerror) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function xhr_onload() {
        if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
          onload(xhr.response);
        } else {
          onerror();
        }
      };
      xhr.onerror = onerror;
      xhr.send(null);
    };
    if (typeof arguments != 'undefined') {
      Module['arguments'] = arguments;
    }
    if (typeof console !== 'undefined') {
      if (!Module['print'])
        Module['print'] = function print(x) {
          console.log(x);
        };
      if (!Module['printErr'])
        Module['printErr'] = function printErr(x) {
          console.warn(x);
        };
    } else {
      var TRY_USE_DUMP = false;
      if (!Module['print'])
        Module['print'] =
          TRY_USE_DUMP && typeof dump !== 'undefined'
            ? function (x) {
                dump(x);
              }
            : function (x) {};
    }
    if (ENVIRONMENT_IS_WORKER) {
      Module['load'] = importScripts;
    }
    if (typeof Module['setWindowTitle'] === 'undefined') {
      Module['setWindowTitle'] = function (title) {
        document.title = title;
      };
    }
  } else {
    throw 'Unknown runtime environment. Where are we?';
  }
  function globalEval(x) {
    eval.call(null, x);
  }
  if (!Module['load'] && Module['read']) {
    Module['load'] = function load(f) {
      globalEval(Module['read'](f));
    };
  }
  if (!Module['print']) {
    Module['print'] = function () {};
  }
  if (!Module['printErr']) {
    Module['printErr'] = Module['print'];
  }
  if (!Module['arguments']) {
    Module['arguments'] = [];
  }
  if (!Module['thisProgram']) {
    Module['thisProgram'] = './this.program';
  }
  if (!Module['quit']) {
    Module['quit'] = function (status, toThrow) {
      throw toThrow;
    };
  }
  Module.print = Module['print'];
  Module.printErr = Module['printErr'];
  Module['preRun'] = [];
  Module['postRun'] = [];
  for (var key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
      Module[key] = moduleOverrides[key];
    }
  }
  moduleOverrides = undefined;
  var Runtime = {
    setTempRet0: function (value) {
      tempRet0 = value;
      return value;
    },
    getTempRet0: function () {
      return tempRet0;
    },
    stackSave: function () {
      return STACKTOP;
    },
    stackRestore: function (stackTop) {
      STACKTOP = stackTop;
    },
    getNativeTypeSize: function (type) {
      switch (type) {
        case 'i1':
        case 'i8':
          return 1;
        case 'i16':
          return 2;
        case 'i32':
          return 4;
        case 'i64':
          return 8;
        case 'float':
          return 4;
        case 'double':
          return 8;
        default: {
          if (type[type.length - 1] === '*') {
            return Runtime.QUANTUM_SIZE;
          } else if (type[0] === 'i') {
            var bits = parseInt(type.substr(1));
            assert(bits % 8 === 0);
            return bits / 8;
          } else {
            return 0;
          }
        }
      }
    },
    getNativeFieldSize: function (type) {
      return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
    },
    STACK_ALIGN: 16,
    prepVararg: function (ptr, type) {
      if (type === 'double' || type === 'i64') {
        if (ptr & 7) {
          assert((ptr & 7) === 4);
          ptr += 4;
        }
      } else {
        assert((ptr & 3) === 0);
      }
      return ptr;
    },
    getAlignSize: function (type, size, vararg) {
      if (!vararg && (type == 'i64' || type == 'double')) return 8;
      if (!type) return Math.min(size, 8);
      return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
    },
    dynCall: function (sig, ptr, args) {
      if (args && args.length) {
        return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
      } else {
        return Module['dynCall_' + sig].call(null, ptr);
      }
    },
    functionPointers: [
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    addFunction: function (func) {
      for (var i = 0; i < Runtime.functionPointers.length; i++) {
        if (!Runtime.functionPointers[i]) {
          Runtime.functionPointers[i] = func;
          return 2 * (1 + i);
        }
      }
      throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
    },
    removeFunction: function (index) {
      Runtime.functionPointers[(index - 2) / 2] = null;
    },
    warnOnce: function (text) {
      if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
      if (!Runtime.warnOnce.shown[text]) {
        Runtime.warnOnce.shown[text] = 1;
        Module.printErr(text);
      }
    },
    funcWrappers: {},
    getFuncWrapper: function (func, sig) {
      assert(sig);
      if (!Runtime.funcWrappers[sig]) {
        Runtime.funcWrappers[sig] = {};
      }
      var sigCache = Runtime.funcWrappers[sig];
      if (!sigCache[func]) {
        if (sig.length === 1) {
          sigCache[func] = function dynCall_wrapper() {
            return Runtime.dynCall(sig, func);
          };
        } else if (sig.length === 2) {
          sigCache[func] = function dynCall_wrapper(arg) {
            return Runtime.dynCall(sig, func, [arg]);
          };
        } else {
          sigCache[func] = function dynCall_wrapper() {
            return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
          };
        }
      }
      return sigCache[func];
    },
    getCompilerSetting: function (name) {
      throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
    },
    stackAlloc: function (size) {
      var ret = STACKTOP;
      STACKTOP = (STACKTOP + size) | 0;
      STACKTOP = (STACKTOP + 15) & -16;
      return ret;
    },
    staticAlloc: function (size) {
      var ret = STATICTOP;
      STATICTOP = (STATICTOP + size) | 0;
      STATICTOP = (STATICTOP + 15) & -16;
      return ret;
    },
    dynamicAlloc: function (size) {
      var ret = HEAP32[DYNAMICTOP_PTR >> 2];
      var end = ((ret + size + 15) | 0) & -16;
      HEAP32[DYNAMICTOP_PTR >> 2] = end;
      if (end >= TOTAL_MEMORY) {
        var success = enlargeMemory();
        if (!success) {
          HEAP32[DYNAMICTOP_PTR >> 2] = ret;
          return 0;
        }
      }
      return ret;
    },
    alignMemory: function (size, quantum) {
      var ret = (size = Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16));
      return ret;
    },
    makeBigInt: function (low, high, unsigned) {
      var ret = unsigned
        ? +(low >>> 0) + +(high >>> 0) * 4294967296
        : +(low >>> 0) + +(high | 0) * 4294967296;
      return ret;
    },
    GLOBAL_BASE: 1024,
    QUANTUM_SIZE: 4,
    __dummy__: 0,
  };
  Module['Runtime'] = Runtime;
  var ABORT = 0;
  var EXITSTATUS = 0;
  function assert(condition, text) {
    if (!condition) {
      abort('Assertion failed: ' + text);
    }
  }
  function getCFunc(ident) {
    var func = Module['_' + ident];
    if (!func) {
      try {
        func = eval('_' + ident);
      } catch (e) {}
    }
    assert(
      func,
      'Cannot call unknown function ' +
        ident +
        ' (perhaps LLVM optimizations or closure removed it?)',
    );
    return func;
  }
  var cwrap, ccall;
  (function () {
    var JSfuncs = {
      stackSave: function () {
        Runtime.stackSave();
      },
      stackRestore: function () {
        Runtime.stackRestore();
      },
      arrayToC: function (arr) {
        var ret = Runtime.stackAlloc(arr.length);
        writeArrayToMemory(arr, ret);
        return ret;
      },
      stringToC: function (str) {
        var ret = 0;
        if (str !== null && str !== undefined && str !== 0) {
          var len = (str.length << 2) + 1;
          ret = Runtime.stackAlloc(len);
          stringToUTF8(str, ret, len);
        }
        return ret;
      },
    };
    var toC = { string: JSfuncs['stringToC'], array: JSfuncs['arrayToC'] };
    ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]];
          if (converter) {
            if (stack === 0) stack = Runtime.stackSave();
            cArgs[i] = converter(args[i]);
          } else {
            cArgs[i] = args[i];
          }
        }
      }
      var ret = func.apply(null, cArgs);
      if (returnType === 'string') ret = Pointer_stringify(ret);
      if (stack !== 0) {
        if (opts && opts.async) {
          EmterpreterAsync.asyncFinalizers.push(function () {
            Runtime.stackRestore(stack);
          });
          return;
        }
        Runtime.stackRestore(stack);
      }
      return ret;
    };
    var sourceRegex =
      /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
    function parseJSFunc(jsfunc) {
      var parsed = jsfunc.toString().match(sourceRegex).slice(1);
      return { arguments: parsed[0], body: parsed[1], returnValue: parsed[2] };
    }
    var JSsource = null;
    function ensureJSsource() {
      if (!JSsource) {
        JSsource = {};
        for (var fun in JSfuncs) {
          if (JSfuncs.hasOwnProperty(fun)) {
            JSsource[fun] = parseJSFunc(JSfuncs[fun]);
          }
        }
      }
    }
    cwrap = function cwrap(ident, returnType, argTypes) {
      argTypes = argTypes || [];
      var cfunc = getCFunc(ident);
      var numericArgs = argTypes.every(function (type) {
        return type === 'number';
      });
      var numericRet = returnType !== 'string';
      if (numericRet && numericArgs) {
        return cfunc;
      }
      var argNames = argTypes.map(function (x, i) {
        return '$' + i;
      });
      var funcstr = '(function(' + argNames.join(',') + ') {';
      var nargs = argTypes.length;
      if (!numericArgs) {
        ensureJSsource();
        funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
        for (var i = 0; i < nargs; i++) {
          var arg = argNames[i],
            type = argTypes[i];
          if (type === 'number') continue;
          var convertCode = JSsource[type + 'ToC'];
          funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
          funcstr += convertCode.body + ';';
          funcstr += arg + '=(' + convertCode.returnValue + ');';
        }
      }
      var cfuncname = parseJSFunc(function () {
        return cfunc;
      }).returnValue;
      funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
      if (!numericRet) {
        var strgfy = parseJSFunc(function () {
          return Pointer_stringify;
        }).returnValue;
        funcstr += 'ret = ' + strgfy + '(ret);';
      }
      if (!numericArgs) {
        ensureJSsource();
        funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
      }
      funcstr += 'return ret})';
      return eval(funcstr);
    };
  })();
  Module['ccall'] = ccall;
  Module['cwrap'] = cwrap;
  function setValue(ptr, value, type, noSafe) {
    type = type || 'i8';
    if (type.charAt(type.length - 1) === '*') type = 'i32';
    switch (type) {
      case 'i1':
        HEAP8[ptr >> 0] = value;
        break;
      case 'i8':
        HEAP8[ptr >> 0] = value;
        break;
      case 'i16':
        HEAP16[ptr >> 1] = value;
        break;
      case 'i32':
        HEAP32[ptr >> 2] = value;
        break;
      case 'i64':
        (tempI64 = [
          value >>> 0,
          ((tempDouble = value),
          +Math_abs(tempDouble) >= 1
            ? tempDouble > 0
              ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0
              : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0
            : 0),
        ]),
          (HEAP32[ptr >> 2] = tempI64[0]),
          (HEAP32[(ptr + 4) >> 2] = tempI64[1]);
        break;
      case 'float':
        HEAPF32[ptr >> 2] = value;
        break;
      case 'double':
        HEAPF64[ptr >> 3] = value;
        break;
      default:
        abort('invalid type for setValue: ' + type);
    }
  }
  Module['setValue'] = setValue;
  function getValue(ptr, type, noSafe) {
    type = type || 'i8';
    if (type.charAt(type.length - 1) === '*') type = 'i32';
    switch (type) {
      case 'i1':
        return HEAP8[ptr >> 0];
      case 'i8':
        return HEAP8[ptr >> 0];
      case 'i16':
        return HEAP16[ptr >> 1];
      case 'i32':
        return HEAP32[ptr >> 2];
      case 'i64':
        return HEAP32[ptr >> 2];
      case 'float':
        return HEAPF32[ptr >> 2];
      case 'double':
        return HEAPF64[ptr >> 3];
      default:
        abort('invalid type for setValue: ' + type);
    }
    return null;
  }
  Module['getValue'] = getValue;
  var ALLOC_NORMAL = 0;
  var ALLOC_STACK = 1;
  var ALLOC_STATIC = 2;
  var ALLOC_DYNAMIC = 3;
  var ALLOC_NONE = 4;
  Module['ALLOC_NORMAL'] = ALLOC_NORMAL;
  Module['ALLOC_STACK'] = ALLOC_STACK;
  Module['ALLOC_STATIC'] = ALLOC_STATIC;
  Module['ALLOC_DYNAMIC'] = ALLOC_DYNAMIC;
  Module['ALLOC_NONE'] = ALLOC_NONE;
  function allocate(slab, types, allocator, ptr) {
    var zeroinit, size;
    if (typeof slab === 'number') {
      zeroinit = true;
      size = slab;
    } else {
      zeroinit = false;
      size = slab.length;
    }
    var singleType = typeof types === 'string' ? types : null;
    var ret;
    if (allocator == ALLOC_NONE) {
      ret = ptr;
    } else {
      ret = [
        typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc,
        Runtime.stackAlloc,
        Runtime.staticAlloc,
        Runtime.dynamicAlloc,
      ][allocator === undefined ? ALLOC_STATIC : allocator](
        Math.max(size, singleType ? 1 : types.length),
      );
    }
    if (zeroinit) {
      var ptr = ret,
        stop;
      assert((ret & 3) == 0);
      stop = ret + (size & ~3);
      for (; ptr < stop; ptr += 4) {
        HEAP32[ptr >> 2] = 0;
      }
      stop = ret + size;
      while (ptr < stop) {
        HEAP8[ptr++ >> 0] = 0;
      }
      return ret;
    }
    if (singleType === 'i8') {
      if (slab.subarray || slab.slice) {
        HEAPU8.set(slab, ret);
      } else {
        HEAPU8.set(new Uint8Array(slab), ret);
      }
      return ret;
    }
    var i = 0,
      type,
      typeSize,
      previousType;
    while (i < size) {
      var curr = slab[i];
      if (typeof curr === 'function') {
        curr = Runtime.getFunctionIndex(curr);
      }
      type = singleType || types[i];
      if (type === 0) {
        i++;
        continue;
      }
      if (type == 'i64') type = 'i32';
      setValue(ret + i, curr, type);
      if (previousType !== type) {
        typeSize = Runtime.getNativeTypeSize(type);
        previousType = type;
      }
      i += typeSize;
    }
    return ret;
  }
  Module['allocate'] = allocate;
  function getMemory(size) {
    if (!staticSealed) return Runtime.staticAlloc(size);
    if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
    return _malloc(size);
  }
  Module['getMemory'] = getMemory;
  function Pointer_stringify(ptr, length) {
    if (length === 0 || !ptr) return '';
    var hasUtf = 0;
    var t;
    var i = 0;
    while (1) {
      t = HEAPU8[(ptr + i) >> 0];
      hasUtf |= t;
      if (t == 0 && !length) break;
      i++;
      if (length && i == length) break;
    }
    if (!length) length = i;
    var ret = '';
    if (hasUtf < 128) {
      var MAX_CHUNK = 1024;
      var curr;
      while (length > 0) {
        curr = String.fromCharCode.apply(
          String,
          HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)),
        );
        ret = ret ? ret + curr : curr;
        ptr += MAX_CHUNK;
        length -= MAX_CHUNK;
      }
      return ret;
    }
    return Module['UTF8ToString'](ptr);
  }
  Module['Pointer_stringify'] = Pointer_stringify;
  function AsciiToString(ptr) {
    var str = '';
    while (1) {
      var ch = HEAP8[ptr++ >> 0];
      if (!ch) return str;
      str += String.fromCharCode(ch);
    }
  }
  Module['AsciiToString'] = AsciiToString;
  function stringToAscii(str, outPtr) {
    return writeAsciiToMemory(str, outPtr, false);
  }
  Module['stringToAscii'] = stringToAscii;
  var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
  function UTF8ArrayToString(u8Array, idx) {
    var endPtr = idx;
    while (u8Array[endPtr]) ++endPtr;
    if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
      return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
    } else {
      var u0, u1, u2, u3, u4, u5;
      var str = '';
      while (1) {
        u0 = u8Array[idx++];
        if (!u0) return str;
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        u1 = u8Array[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode(((u0 & 31) << 6) | u1);
          continue;
        }
        u2 = u8Array[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          u3 = u8Array[idx++] & 63;
          if ((u0 & 248) == 240) {
            u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
          } else {
            u4 = u8Array[idx++] & 63;
            if ((u0 & 252) == 248) {
              u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
            } else {
              u5 = u8Array[idx++] & 63;
              u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
            }
          }
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        }
      }
    }
  }
  Module['UTF8ArrayToString'] = UTF8ArrayToString;
  function UTF8ToString(ptr) {
    return UTF8ArrayToString(HEAPU8, ptr);
  }
  Module['UTF8ToString'] = UTF8ToString;
  function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
      var u = str.charCodeAt(i);
      if (u >= 55296 && u <= 57343) u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        outU8Array[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        outU8Array[outIdx++] = 192 | (u >> 6);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        outU8Array[outIdx++] = 224 | (u >> 12);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else if (u <= 2097151) {
        if (outIdx + 3 >= endIdx) break;
        outU8Array[outIdx++] = 240 | (u >> 18);
        outU8Array[outIdx++] = 128 | ((u >> 12) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else if (u <= 67108863) {
        if (outIdx + 4 >= endIdx) break;
        outU8Array[outIdx++] = 248 | (u >> 24);
        outU8Array[outIdx++] = 128 | ((u >> 18) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 12) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      } else {
        if (outIdx + 5 >= endIdx) break;
        outU8Array[outIdx++] = 252 | (u >> 30);
        outU8Array[outIdx++] = 128 | ((u >> 24) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 18) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 12) & 63);
        outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
        outU8Array[outIdx++] = 128 | (u & 63);
      }
    }
    outU8Array[outIdx] = 0;
    return outIdx - startIdx;
  }
  Module['stringToUTF8Array'] = stringToUTF8Array;
  function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  }
  Module['stringToUTF8'] = stringToUTF8;
  function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var u = str.charCodeAt(i);
      if (u >= 55296 && u <= 57343) u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023);
      if (u <= 127) {
        ++len;
      } else if (u <= 2047) {
        len += 2;
      } else if (u <= 65535) {
        len += 3;
      } else if (u <= 2097151) {
        len += 4;
      } else if (u <= 67108863) {
        len += 5;
      } else {
        len += 6;
      }
    }
    return len;
  }
  Module['lengthBytesUTF8'] = lengthBytesUTF8;
  var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
  function demangle(func) {
    var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
    if (__cxa_demangle_func) {
      try {
        var s = func.substr(1);
        var len = lengthBytesUTF8(s) + 1;
        var buf = _malloc(len);
        stringToUTF8(s, buf, len);
        var status = _malloc(4);
        var ret = __cxa_demangle_func(buf, 0, 0, status);
        if (getValue(status, 'i32') === 0 && ret) {
          return Pointer_stringify(ret);
        }
      } catch (e) {
      } finally {
        if (buf) _free(buf);
        if (status) _free(status);
        if (ret) _free(ret);
      }
      return func;
    }
    Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
    return func;
  }
  function demangleAll(text) {
    var regex = /__Z[\w\d_]+/g;
    return text.replace(regex, function (x) {
      var y = demangle(x);
      return x === y ? x : x + ' [' + y + ']';
    });
  }
  function jsStackTrace() {
    var err = new Error();
    if (!err.stack) {
      try {
        throw new Error(0);
      } catch (e) {
        err = e;
      }
      if (!err.stack) {
        return '(no stack trace available)';
      }
    }
    return err.stack.toString();
  }
  function stackTrace() {
    var js = jsStackTrace();
    if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
    return demangleAll(js);
  }
  Module['stackTrace'] = stackTrace;
  var WASM_PAGE_SIZE = 65536;
  var ASMJS_PAGE_SIZE = 16777216;
  function alignUp(x, multiple) {
    if (x % multiple > 0) {
      x += multiple - (x % multiple);
    }
    return x;
  }
  var HEAP;
  var buffer;
  var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
  function updateGlobalBuffer(buf) {
    Module['buffer'] = buffer = buf;
  }
  function updateGlobalBufferViews() {
    Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
    Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
    Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
    Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
    Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
    Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
    Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
    Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
  }
  var STATIC_BASE, STATICTOP, staticSealed;
  var STACK_BASE, STACKTOP, STACK_MAX;
  var DYNAMIC_BASE, DYNAMICTOP_PTR;
  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;
  function abortOnCannotGrowMemory() {
    abort(
      'Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' +
        TOTAL_MEMORY +
        ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ',
    );
  }
  function enlargeMemory() {
    abortOnCannotGrowMemory();
  }
  var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
  var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
  if (TOTAL_MEMORY < TOTAL_STACK)
    Module.printErr(
      'TOTAL_MEMORY should be larger than TOTAL_STACK, was ' +
        TOTAL_MEMORY +
        '! (TOTAL_STACK=' +
        TOTAL_STACK +
        ')',
    );
  if (Module['buffer']) {
    buffer = Module['buffer'];
  } else {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.Memory === 'function') {
      Module['wasmMemory'] = new WebAssembly.Memory({
        initial: TOTAL_MEMORY / WASM_PAGE_SIZE,
        maximum: TOTAL_MEMORY / WASM_PAGE_SIZE,
      });
      buffer = Module['wasmMemory'].buffer;
    } else {
      buffer = new ArrayBuffer(TOTAL_MEMORY);
    }
  }
  updateGlobalBufferViews();
  function getTotalMemory() {
    return TOTAL_MEMORY;
  }
  HEAP32[0] = 1668509029;
  HEAP16[1] = 25459;
  if (HEAPU8[2] !== 115 || HEAPU8[3] !== 99)
    throw 'Runtime error: expected the system to be little-endian!';
  Module['HEAP'] = HEAP;
  Module['buffer'] = buffer;
  Module['HEAP8'] = HEAP8;
  Module['HEAP16'] = HEAP16;
  Module['HEAP32'] = HEAP32;
  Module['HEAPU8'] = HEAPU8;
  Module['HEAPU16'] = HEAPU16;
  Module['HEAPU32'] = HEAPU32;
  Module['HEAPF32'] = HEAPF32;
  Module['HEAPF64'] = HEAPF64;
  function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
      var callback = callbacks.shift();
      if (typeof callback == 'function') {
        callback();
        continue;
      }
      var func = callback.func;
      if (typeof func === 'number') {
        if (callback.arg === undefined) {
          Module['dynCall_v'](func);
        } else {
          Module['dynCall_vi'](func, callback.arg);
        }
      } else {
        func(callback.arg === undefined ? null : callback.arg);
      }
    }
  }
  var __ATPRERUN__ = [];
  var __ATINIT__ = [];
  var __ATMAIN__ = [];
  var __ATEXIT__ = [];
  var __ATPOSTRUN__ = [];
  var runtimeInitialized = false;
  var runtimeExited = false;
  function preRun() {
    if (Module['preRun']) {
      if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
      while (Module['preRun'].length) {
        addOnPreRun(Module['preRun'].shift());
      }
    }
    callRuntimeCallbacks(__ATPRERUN__);
  }
  function ensureInitRuntime() {
    if (runtimeInitialized) return;
    runtimeInitialized = true;
    callRuntimeCallbacks(__ATINIT__);
  }
  function preMain() {
    callRuntimeCallbacks(__ATMAIN__);
  }
  function exitRuntime() {
    callRuntimeCallbacks(__ATEXIT__);
    runtimeExited = true;
  }
  function postRun() {
    if (Module['postRun']) {
      if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
      while (Module['postRun'].length) {
        addOnPostRun(Module['postRun'].shift());
      }
    }
    callRuntimeCallbacks(__ATPOSTRUN__);
  }
  function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb);
  }
  Module['addOnPreRun'] = addOnPreRun;
  function addOnInit(cb) {
    __ATINIT__.unshift(cb);
  }
  Module['addOnInit'] = addOnInit;
  function addOnPreMain(cb) {
    __ATMAIN__.unshift(cb);
  }
  Module['addOnPreMain'] = addOnPreMain;
  function addOnExit(cb) {
    __ATEXIT__.unshift(cb);
  }
  Module['addOnExit'] = addOnExit;
  function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb);
  }
  Module['addOnPostRun'] = addOnPostRun;
  function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  }
  Module['intArrayFromString'] = intArrayFromString;
  function intArrayToString(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      var chr = array[i];
      if (chr > 255) {
        chr &= 255;
      }
      ret.push(String.fromCharCode(chr));
    }
    return ret.join('');
  }
  Module['intArrayToString'] = intArrayToString;
  function writeStringToMemory(string, buffer, dontAddNull) {
    Runtime.warnOnce(
      'writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!',
    );
    var lastChar, end;
    if (dontAddNull) {
      end = buffer + lengthBytesUTF8(string);
      lastChar = HEAP8[end];
    }
    stringToUTF8(string, buffer, Infinity);
    if (dontAddNull) HEAP8[end] = lastChar;
  }
  Module['writeStringToMemory'] = writeStringToMemory;
  function writeArrayToMemory(array, buffer) {
    HEAP8.set(array, buffer);
  }
  Module['writeArrayToMemory'] = writeArrayToMemory;
  function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
      HEAP8[buffer++ >> 0] = str.charCodeAt(i);
    }
    if (!dontAddNull) HEAP8[buffer >> 0] = 0;
  }
  Module['writeAsciiToMemory'] = writeAsciiToMemory;
  if (!Math['imul'] || Math['imul'](4294967295, 5) !== -5)
    Math['imul'] = function imul(a, b) {
      var ah = a >>> 16;
      var al = a & 65535;
      var bh = b >>> 16;
      var bl = b & 65535;
      return (al * bl + ((ah * bl + al * bh) << 16)) | 0;
    };
  Math.imul = Math['imul'];
  if (!Math['fround']) {
    var froundBuffer = new Float32Array(1);
    Math['fround'] = function (x) {
      froundBuffer[0] = x;
      return froundBuffer[0];
    };
  }
  Math.fround = Math['fround'];
  if (!Math['clz32'])
    Math['clz32'] = function (x) {
      x = x >>> 0;
      for (var i = 0; i < 32; i++) {
        if (x & (1 << (31 - i))) return i;
      }
      return 32;
    };
  Math.clz32 = Math['clz32'];
  if (!Math['trunc'])
    Math['trunc'] = function (x) {
      return x < 0 ? Math.ceil(x) : Math.floor(x);
    };
  Math.trunc = Math['trunc'];
  var Math_abs = Math.abs;
  var Math_cos = Math.cos;
  var Math_sin = Math.sin;
  var Math_tan = Math.tan;
  var Math_acos = Math.acos;
  var Math_asin = Math.asin;
  var Math_atan = Math.atan;
  var Math_atan2 = Math.atan2;
  var Math_exp = Math.exp;
  var Math_log = Math.log;
  var Math_sqrt = Math.sqrt;
  var Math_ceil = Math.ceil;
  var Math_floor = Math.floor;
  var Math_pow = Math.pow;
  var Math_imul = Math.imul;
  var Math_fround = Math.fround;
  var Math_round = Math.round;
  var Math_min = Math.min;
  var Math_clz32 = Math.clz32;
  var Math_trunc = Math.trunc;
  var runDependencies = 0;
  var runDependencyWatcher = null;
  var dependenciesFulfilled = null;
  function getUniqueRunDependency(id) {
    return id;
  }
  function addRunDependency(id) {
    runDependencies++;
    if (Module['monitorRunDependencies']) {
      Module['monitorRunDependencies'](runDependencies);
    }
  }
  Module['addRunDependency'] = addRunDependency;
  function removeRunDependency(id) {
    runDependencies--;
    if (Module['monitorRunDependencies']) {
      Module['monitorRunDependencies'](runDependencies);
    }
    if (runDependencies == 0) {
      if (runDependencyWatcher !== null) {
        clearInterval(runDependencyWatcher);
        runDependencyWatcher = null;
      }
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  }
  Module['removeRunDependency'] = removeRunDependency;
  Module['preloadedImages'] = {};
  Module['preloadedAudios'] = {};
  var memoryInitializer = null;
  function integrateWasmJS(Module) {
    var method = Module['wasmJSMethod'] || 'native-wasm';
    Module['wasmJSMethod'] = method;
    var wasmTextFile = Module['wasmTextFile'] || 'wacl.wast';
    var wasmBinaryFile = Module['wasmBinaryFile'] || 'wacl.wasm';
    var asmjsCodeFile = Module['asmjsCodeFile'] || 'wacl.temp.asm.js';
    var wasmPageSize = 64 * 1024;
    var asm2wasmImports = {
      'f64-rem': function (x, y) {
        return x % y;
      },
      'f64-to-int': function (x) {
        return x | 0;
      },
      'i32s-div': function (x, y) {
        return ((x | 0) / (y | 0)) | 0;
      },
      'i32u-div': function (x, y) {
        return ((x >>> 0) / (y >>> 0)) >>> 0;
      },
      'i32s-rem': function (x, y) {
        return (x | 0) % (y | 0) | 0;
      },
      'i32u-rem': function (x, y) {
        return (x >>> 0) % (y >>> 0) >>> 0;
      },
      debugger: function () {
        debugger;
      },
    };
    var info = { global: null, env: null, asm2wasm: asm2wasmImports, parent: Module };
    var exports = null;
    function lookupImport(mod, base) {
      var lookup = info;
      if (mod.indexOf('.') < 0) {
        lookup = (lookup || {})[mod];
      } else {
        var parts = mod.split('.');
        lookup = (lookup || {})[parts[0]];
        lookup = (lookup || {})[parts[1]];
      }
      if (base) {
        lookup = (lookup || {})[base];
      }
      if (lookup === undefined) {
        abort('bad lookupImport to (' + mod + ').' + base);
      }
      return lookup;
    }
    function mergeMemory(newBuffer) {
      var oldBuffer = Module['buffer'];
      if (newBuffer.byteLength < oldBuffer.byteLength) {
        Module['printErr'](
          'the new buffer in mergeMemory is smaller than the previous one. in native wasm, we should grow memory here',
        );
      }
      var oldView = new Int8Array(oldBuffer);
      var newView = new Int8Array(newBuffer);
      if (!memoryInitializer) {
        oldView.set(
          newView.subarray(Module['STATIC_BASE'], Module['STATIC_BASE'] + Module['STATIC_BUMP']),
          Module['STATIC_BASE'],
        );
      }
      newView.set(oldView);
      updateGlobalBuffer(newBuffer);
      updateGlobalBufferViews();
    }
    var WasmTypes = { none: 0, i32: 1, i64: 2, f32: 3, f64: 4 };
    function fixImports(imports) {
      if (!0) return imports;
      var ret = {};
      for (var i in imports) {
        var fixed = i;
        if (fixed[0] == '_') fixed = fixed.substr(1);
        ret[fixed] = imports[i];
      }
      return ret;
    }
    function getBinary() {
      var binary;
      if (Module['wasmBinary']) {
        binary = Module['wasmBinary'];
        binary = new Uint8Array(binary);
      } else if (Module['readBinary']) {
        binary = Module['readBinary'](wasmBinaryFile);
      } else {
        throw "on the web, we need the wasm binary to be preloaded and set on Module['wasmBinary']. emcc.py will do that for you when generating HTML (but not JS)";
      }
      return binary;
    }
    function getBinaryPromise() {
      if (!Module['wasmBinary'] && typeof fetch === 'function') {
        return fetch(wasmBinaryFile).then(function (response) {
          return response.arrayBuffer();
        });
      }
      return new Promise(function (resolve, reject) {
        resolve(getBinary());
      });
    }
    function doJustAsm(global, env, providedBuffer) {
      if (typeof Module['asm'] !== 'function' || Module['asm'] === methodHandler) {
        if (!Module['asmPreload']) {
          eval(Module['read'](asmjsCodeFile));
        } else {
          Module['asm'] = Module['asmPreload'];
        }
      }
      if (typeof Module['asm'] !== 'function') {
        Module['printErr']('asm evalling did not set the module properly');
        return false;
      }
      return Module['asm'](global, env, providedBuffer);
    }
    function doNativeWasm(global, env, providedBuffer) {
      if (typeof WebAssembly !== 'object') {
        Module['printErr']('no native wasm support detected');
        return false;
      }
      if (!(Module['wasmMemory'] instanceof WebAssembly.Memory)) {
        Module['printErr']('no native wasm Memory in use');
        return false;
      }
      env['memory'] = Module['wasmMemory'];
      info['global'] = { NaN: NaN, Infinity: Infinity };
      info['global.Math'] = global.Math;
      info['env'] = env;
      function receiveInstance(instance) {
        exports = instance.exports;
        if (exports.memory) mergeMemory(exports.memory);
        Module['asm'] = exports;
        Module['usingWasm'] = true;
        removeRunDependency('wasm-instantiate');
      }
      addRunDependency('wasm-instantiate');
      if (Module['instantiateWasm']) {
        try {
          return Module['instantiateWasm'](info, receiveInstance);
        } catch (e) {
          Module['printErr']('Module.instantiateWasm callback failed with error: ' + e);
          return false;
        }
      }
      Module['printErr']('asynchronously preparing wasm');
      getBinaryPromise()
        .then(function (binary) {
          return WebAssembly.instantiate(binary, info);
        })
        .then(function (output) {
          receiveInstance(output.instance);
        })
        .catch(function (reason) {
          Module['printErr']('failed to asynchronously prepare wasm: ' + reason);
          Module['quit'](1, reason);
        });
      return {};
    }
    function doWasmPolyfill(global, env, providedBuffer, method) {
      if (typeof WasmJS !== 'function') {
        Module['printErr']('WasmJS not detected - polyfill not bundled?');
        return false;
      }
      var wasmJS = WasmJS({});
      wasmJS['outside'] = Module;
      wasmJS['info'] = info;
      wasmJS['lookupImport'] = lookupImport;
      assert(providedBuffer === Module['buffer']);
      info.global = global;
      info.env = env;
      assert(providedBuffer === Module['buffer']);
      env['memory'] = providedBuffer;
      assert(env['memory'] instanceof ArrayBuffer);
      wasmJS['providedTotalMemory'] = Module['buffer'].byteLength;
      var code;
      if (method === 'interpret-binary') {
        code = getBinary();
      } else {
        code = Module['read'](method == 'interpret-asm2wasm' ? asmjsCodeFile : wasmTextFile);
      }
      var temp;
      if (method == 'interpret-asm2wasm') {
        temp = wasmJS['_malloc'](code.length + 1);
        wasmJS['writeAsciiToMemory'](code, temp);
        wasmJS['_load_asm2wasm'](temp);
      } else if (method === 'interpret-s-expr') {
        temp = wasmJS['_malloc'](code.length + 1);
        wasmJS['writeAsciiToMemory'](code, temp);
        wasmJS['_load_s_expr2wasm'](temp);
      } else if (method === 'interpret-binary') {
        temp = wasmJS['_malloc'](code.length);
        wasmJS['HEAPU8'].set(code, temp);
        wasmJS['_load_binary2wasm'](temp, code.length);
      } else {
        throw 'what? ' + method;
      }
      wasmJS['_free'](temp);
      wasmJS['_instantiate'](temp);
      if (Module['newBuffer']) {
        mergeMemory(Module['newBuffer']);
        Module['newBuffer'] = null;
      }
      exports = wasmJS['asmExports'];
      return exports;
    }
    Module['asmPreload'] = Module['asm'];
    Module['reallocBuffer'] = function (size) {
      var PAGE_MULTIPLE = Module['usingWasm'] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE;
      size = alignUp(size, PAGE_MULTIPLE);
      var old = Module['buffer'];
      var oldSize = old.byteLength;
      if (Module['usingWasm']) {
        try {
          var result = Module['wasmMemory'].grow((size - oldSize) / wasmPageSize);
          if (result !== (-1 | 0)) {
            return (Module['buffer'] = Module['wasmMemory'].buffer);
          } else {
            return null;
          }
        } catch (e) {
          return null;
        }
      } else {
        exports['__growWasmMemory']((size - oldSize) / wasmPageSize);
        return Module['buffer'] !== old ? Module['buffer'] : null;
      }
    };
    Module['asm'] = function (global, env, providedBuffer) {
      global = fixImports(global);
      env = fixImports(env);
      if (!env['table']) {
        var TABLE_SIZE = Module['wasmTableSize'];
        if (TABLE_SIZE === undefined) TABLE_SIZE = 1024;
        var MAX_TABLE_SIZE = Module['wasmMaxTableSize'];
        if (typeof WebAssembly === 'object' && typeof WebAssembly.Table === 'function') {
          if (MAX_TABLE_SIZE !== undefined) {
            env['table'] = new WebAssembly.Table({
              initial: TABLE_SIZE,
              maximum: MAX_TABLE_SIZE,
              element: 'anyfunc',
            });
          } else {
            env['table'] = new WebAssembly.Table({ initial: TABLE_SIZE, element: 'anyfunc' });
          }
        } else {
          env['table'] = new Array(TABLE_SIZE);
        }
        Module['wasmTable'] = env['table'];
      }
      if (!env['memoryBase']) {
        env['memoryBase'] = Module['STATIC_BASE'];
      }
      if (!env['tableBase']) {
        env['tableBase'] = 0;
      }
      var exports;
      var methods = method.split(',');
      for (var i = 0; i < methods.length; i++) {
        var curr = methods[i];
        Module['printErr']('trying binaryen method: ' + curr);
        if (curr === 'native-wasm') {
          if ((exports = doNativeWasm(global, env, providedBuffer))) break;
        } else if (curr === 'asmjs') {
          if ((exports = doJustAsm(global, env, providedBuffer))) break;
        } else if (
          curr === 'interpret-asm2wasm' ||
          curr === 'interpret-s-expr' ||
          curr === 'interpret-binary'
        ) {
          if ((exports = doWasmPolyfill(global, env, providedBuffer, curr))) break;
        } else {
          throw 'bad method: ' + curr;
        }
      }
      if (!exports)
        throw 'no binaryen method succeeded. consider enabling more options, like interpreting, if you want that: https://github.com/kripken/emscripten/wiki/WebAssembly#binaryen-methods';
      Module['printErr']('binaryen method succeeded.');
      return exports;
    };
    var methodHandler = Module['asm'];
  }
  integrateWasmJS(Module);
  var ASM_CONSTS = [
    function ($0, $1, $2, $3) {
      {
        var action = Pointer_stringify($0);
        selector = Pointer_stringify($1);
        key = Pointer_stringify($2);
        val = Pointer_stringify($3);
        var elts = document.querySelectorAll(selector);
        for (var i = 0; i < elts.length; i++) {
          if (action === 'attr') {
            elts[i][key] = val;
          } else {
            elts[i].style[key] = val;
          }
        }
        return elts.length;
      }
    },
  ];
  function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
    return ASM_CONSTS[code](a0, a1, a2, a3);
  }
  STATIC_BASE = 1024;
  STATICTOP = STATIC_BASE + 206736;
  __ATINIT__.push();
  memoryInitializer =
    Module['wasmJSMethod'].indexOf('asmjs') >= 0 ||
    Module['wasmJSMethod'].indexOf('interpret-asm2wasm') >= 0
      ? 'wacl.js.mem'
      : null;
  var STATIC_BUMP = 206736;
  Module['STATIC_BASE'] = STATIC_BASE;
  Module['STATIC_BUMP'] = STATIC_BUMP;
  var tempDoublePtr = STATICTOP;
  STATICTOP += 16;
  function __inet_pton4_raw(str) {
    var b = str.split('.');
    for (var i = 0; i < 4; i++) {
      var tmp = Number(b[i]);
      if (isNaN(tmp)) return null;
      b[i] = tmp;
    }
    return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
  }
  var _htons = undefined;
  Module['_htons'] = _htons;
  function __inet_pton6_raw(str) {
    var words;
    var w, offset, z;
    var valid6regx =
      /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;
    var parts = [];
    if (!valid6regx.test(str)) {
      return null;
    }
    if (str === '::') {
      return [0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (str.indexOf('::') === 0) {
      str = str.replace('::', 'Z:');
    } else {
      str = str.replace('::', ':Z:');
    }
    if (str.indexOf('.') > 0) {
      str = str.replace(new RegExp('[.]', 'g'), ':');
      words = str.split(':');
      words[words.length - 4] =
        parseInt(words[words.length - 4]) + parseInt(words[words.length - 3]) * 256;
      words[words.length - 3] =
        parseInt(words[words.length - 2]) + parseInt(words[words.length - 1]) * 256;
      words = words.slice(0, words.length - 2);
    } else {
      words = str.split(':');
    }
    offset = 0;
    z = 0;
    for (w = 0; w < words.length; w++) {
      if (typeof words[w] === 'string') {
        if (words[w] === 'Z') {
          for (z = 0; z < 8 - words.length + 1; z++) {
            parts[w + z] = 0;
          }
          offset = z - 1;
        } else {
          parts[w + offset] = _htons(parseInt(words[w], 16));
        }
      } else {
        parts[w + offset] = words[w];
      }
    }
    return [
      (parts[1] << 16) | parts[0],
      (parts[3] << 16) | parts[2],
      (parts[5] << 16) | parts[4],
      (parts[7] << 16) | parts[6],
    ];
  }
  var DNS = {
    address_map: { id: 1, addrs: {}, names: {} },
    lookup_name: function (name) {
      var res = __inet_pton4_raw(name);
      if (res !== null) {
        return name;
      }
      res = __inet_pton6_raw(name);
      if (res !== null) {
        return name;
      }
      var addr;
      if (DNS.address_map.addrs[name]) {
        addr = DNS.address_map.addrs[name];
      } else {
        var id = DNS.address_map.id++;
        assert(id < 65535, 'exceeded max address mappings of 65535');
        addr = '172.29.' + (id & 255) + '.' + (id & 65280);
        DNS.address_map.names[addr] = name;
        DNS.address_map.addrs[name] = addr;
      }
      return addr;
    },
    lookup_addr: function (addr) {
      if (DNS.address_map.names[addr]) {
        return DNS.address_map.names[addr];
      }
      return null;
    },
  };
  function _gethostbyname(name) {
    name = Pointer_stringify(name);
    var ret = _malloc(20);
    var nameBuf = _malloc(name.length + 1);
    stringToUTF8(name, nameBuf, name.length + 1);
    HEAP32[ret >> 2] = nameBuf;
    var aliasesBuf = _malloc(4);
    HEAP32[aliasesBuf >> 2] = 0;
    HEAP32[(ret + 4) >> 2] = aliasesBuf;
    var afinet = 2;
    HEAP32[(ret + 8) >> 2] = afinet;
    HEAP32[(ret + 12) >> 2] = 4;
    var addrListBuf = _malloc(12);
    HEAP32[addrListBuf >> 2] = addrListBuf + 8;
    HEAP32[(addrListBuf + 4) >> 2] = 0;
    HEAP32[(addrListBuf + 8) >> 2] = __inet_pton4_raw(DNS.lookup_name(name));
    HEAP32[(ret + 16) >> 2] = addrListBuf;
    return ret;
  }
  function __inet_ntop4_raw(addr) {
    return (
      (addr & 255) +
      '.' +
      ((addr >> 8) & 255) +
      '.' +
      ((addr >> 16) & 255) +
      '.' +
      ((addr >> 24) & 255)
    );
  }
  function _gethostbyaddr(addr, addrlen, type) {
    if (type !== 2) {
      ___setErrNo(ERRNO_CODES.EAFNOSUPPORT);
      return null;
    }
    addr = HEAP32[addr >> 2];
    var host = __inet_ntop4_raw(addr);
    var lookup = DNS.lookup_addr(host);
    if (lookup) {
      host = lookup;
    }
    var hostp = allocate(intArrayFromString(host), 'i8', ALLOC_STACK);
    return _gethostbyname(hostp);
  }
  function ___setErrNo(value) {
    if (Module['___errno_location']) HEAP32[Module['___errno_location']() >> 2] = value;
    return value;
  }
  var ERRNO_CODES = {
    EPERM: 1,
    ENOENT: 2,
    ESRCH: 3,
    EINTR: 4,
    EIO: 5,
    ENXIO: 6,
    E2BIG: 7,
    ENOEXEC: 8,
    EBADF: 9,
    ECHILD: 10,
    EAGAIN: 11,
    EWOULDBLOCK: 11,
    ENOMEM: 12,
    EACCES: 13,
    EFAULT: 14,
    ENOTBLK: 15,
    EBUSY: 16,
    EEXIST: 17,
    EXDEV: 18,
    ENODEV: 19,
    ENOTDIR: 20,
    EISDIR: 21,
    EINVAL: 22,
    ENFILE: 23,
    EMFILE: 24,
    ENOTTY: 25,
    ETXTBSY: 26,
    EFBIG: 27,
    ENOSPC: 28,
    ESPIPE: 29,
    EROFS: 30,
    EMLINK: 31,
    EPIPE: 32,
    EDOM: 33,
    ERANGE: 34,
    ENOMSG: 42,
    EIDRM: 43,
    ECHRNG: 44,
    EL2NSYNC: 45,
    EL3HLT: 46,
    EL3RST: 47,
    ELNRNG: 48,
    EUNATCH: 49,
    ENOCSI: 50,
    EL2HLT: 51,
    EDEADLK: 35,
    ENOLCK: 37,
    EBADE: 52,
    EBADR: 53,
    EXFULL: 54,
    ENOANO: 55,
    EBADRQC: 56,
    EBADSLT: 57,
    EDEADLOCK: 35,
    EBFONT: 59,
    ENOSTR: 60,
    ENODATA: 61,
    ETIME: 62,
    ENOSR: 63,
    ENONET: 64,
    ENOPKG: 65,
    EREMOTE: 66,
    ENOLINK: 67,
    EADV: 68,
    ESRMNT: 69,
    ECOMM: 70,
    EPROTO: 71,
    EMULTIHOP: 72,
    EDOTDOT: 73,
    EBADMSG: 74,
    ENOTUNIQ: 76,
    EBADFD: 77,
    EREMCHG: 78,
    ELIBACC: 79,
    ELIBBAD: 80,
    ELIBSCN: 81,
    ELIBMAX: 82,
    ELIBEXEC: 83,
    ENOSYS: 38,
    ENOTEMPTY: 39,
    ENAMETOOLONG: 36,
    ELOOP: 40,
    EOPNOTSUPP: 95,
    EPFNOSUPPORT: 96,
    ECONNRESET: 104,
    ENOBUFS: 105,
    EAFNOSUPPORT: 97,
    EPROTOTYPE: 91,
    ENOTSOCK: 88,
    ENOPROTOOPT: 92,
    ESHUTDOWN: 108,
    ECONNREFUSED: 111,
    EADDRINUSE: 98,
    ECONNABORTED: 103,
    ENETUNREACH: 101,
    ENETDOWN: 100,
    ETIMEDOUT: 110,
    EHOSTDOWN: 112,
    EHOSTUNREACH: 113,
    EINPROGRESS: 115,
    EALREADY: 114,
    EDESTADDRREQ: 89,
    EMSGSIZE: 90,
    EPROTONOSUPPORT: 93,
    ESOCKTNOSUPPORT: 94,
    EADDRNOTAVAIL: 99,
    ENETRESET: 102,
    EISCONN: 106,
    ENOTCONN: 107,
    ETOOMANYREFS: 109,
    EUSERS: 87,
    EDQUOT: 122,
    ESTALE: 116,
    ENOTSUP: 95,
    ENOMEDIUM: 123,
    EILSEQ: 84,
    EOVERFLOW: 75,
    ECANCELED: 125,
    ENOTRECOVERABLE: 131,
    EOWNERDEAD: 130,
    ESTRPIPE: 86,
  };
  var Sockets = {
    BUFFER_SIZE: 10240,
    MAX_BUFFER_SIZE: 10485760,
    nextFd: 1,
    fds: {},
    nextport: 1,
    maxport: 65535,
    peer: null,
    connections: {},
    portmap: {},
    localAddr: 4261412874,
    addrPool: [
      33554442, 50331658, 67108874, 83886090, 100663306, 117440522, 134217738, 150994954, 167772170,
      184549386, 201326602, 218103818, 234881034,
    ],
  };
  function __inet_ntop6_raw(ints) {
    var str = '';
    var word = 0;
    var longest = 0;
    var lastzero = 0;
    var zstart = 0;
    var len = 0;
    var i = 0;
    var parts = [
      ints[0] & 65535,
      ints[0] >> 16,
      ints[1] & 65535,
      ints[1] >> 16,
      ints[2] & 65535,
      ints[2] >> 16,
      ints[3] & 65535,
      ints[3] >> 16,
    ];
    var hasipv4 = true;
    var v4part = '';
    for (let i = 0; i < 5; i++) {
      if (parts[i] !== 0) {
        hasipv4 = false;
        break;
      }
    }
    if (hasipv4) {
      v4part = __inet_ntop4_raw(parts[6] | (parts[7] << 16));
      if (parts[5] === -1) {
        str = '::ffff:';
        str += v4part;
        return str;
      }
      if (parts[5] === 0) {
        str = '::';
        if (v4part === '0.0.0.0') v4part = '';
        if (v4part === '0.0.0.1') v4part = '1';
        str += v4part;
        return str;
      }
    }
    for (word = 0; word < 8; word++) {
      if (parts[word] === 0) {
        if (word - lastzero > 1) {
          len = 0;
        }
        lastzero = word;
        len++;
      }
      if (len > longest) {
        longest = len;
        zstart = word - longest + 1;
      }
    }
    for (word = 0; word < 8; word++) {
      if (longest > 1) {
        if (parts[word] === 0 && word >= zstart && word < zstart + longest) {
          if (word === zstart) {
            str += ':';
            if (zstart === 0) str += ':';
          }
          continue;
        }
      }
      str += Number(_ntohs(parts[word] & 65535)).toString(16);
      str += word < 7 ? ':' : '';
    }
    return str;
  }
  function __write_sockaddr(sa, family, addr, port) {
    switch (family) {
      case 2:
        addr = __inet_pton4_raw(addr);
        HEAP16[sa >> 1] = family;
        HEAP32[(sa + 4) >> 2] = addr;
        HEAP16[(sa + 2) >> 1] = _htons(port);
        break;
      case 10:
        addr = __inet_pton6_raw(addr);
        HEAP32[sa >> 2] = family;
        HEAP32[(sa + 8) >> 2] = addr[0];
        HEAP32[(sa + 12) >> 2] = addr[1];
        HEAP32[(sa + 16) >> 2] = addr[2];
        HEAP32[(sa + 20) >> 2] = addr[3];
        HEAP16[(sa + 2) >> 1] = _htons(port);
        HEAP32[(sa + 4) >> 2] = 0;
        HEAP32[(sa + 24) >> 2] = 0;
        break;
      default:
        return { errno: ERRNO_CODES.EAFNOSUPPORT };
    }
    return {};
  }
  function _getaddrinfo(node, service, hint, out) {
    var addrs = [];
    var addr = 0;
    var port = 0;
    var flags = 0;
    var family = 0;
    var type = 0;
    var proto = 0;
    var ai;
    function allocaddrinfo(family, type, proto, canon, addr, port) {
      var sa, salen, ai;
      var res;
      salen = family === 10 ? 28 : 16;
      addr = family === 10 ? __inet_ntop6_raw(addr) : __inet_ntop4_raw(addr);
      sa = _malloc(salen);
      res = __write_sockaddr(sa, family, addr, port);
      assert(!res.errno);
      ai = _malloc(32);
      HEAP32[(ai + 4) >> 2] = family;
      HEAP32[(ai + 8) >> 2] = type;
      HEAP32[(ai + 12) >> 2] = proto;
      if (canon) {
        HEAP32[(ai + 24) >> 2] = canon;
      }
      HEAP32[(ai + 20) >> 2] = sa;
      if (family === 10) {
        HEAP32[(ai + 16) >> 2] = 28;
      } else {
        HEAP32[(ai + 16) >> 2] = 16;
      }
      HEAP32[(ai + 28) >> 2] = 0;
      return ai;
    }
    if (hint) {
      flags = HEAP32[hint >> 2];
      family = HEAP32[(hint + 4) >> 2];
      type = HEAP32[(hint + 8) >> 2];
      proto = HEAP32[(hint + 12) >> 2];
    }
    if (type && !proto) {
      proto = type === 2 ? 17 : 6;
    }
    if (!type && proto) {
      type = proto === 17 ? 2 : 1;
    }
    if (proto === 0) {
      proto = 6;
    }
    if (type === 0) {
      type = 1;
    }
    if (!node && !service) {
      return -2;
    }
    if (flags & ~(1 | 2 | 4 | 1024 | 8 | 16 | 32)) {
      return -1;
    }
    if (hint !== 0 && HEAP32[hint >> 2] & 2 && !node) {
      return -1;
    }
    if (flags & 32) {
      return -2;
    }
    if (type !== 0 && type !== 1 && type !== 2) {
      return -7;
    }
    if (family !== 0 && family !== 2 && family !== 10) {
      return -6;
    }
    if (service) {
      service = Pointer_stringify(service);
      port = parseInt(service, 10);
      if (isNaN(port)) {
        if (flags & 1024) {
          return -2;
        }
        return -8;
      }
    }
    if (!node) {
      if (family === 0) {
        family = 2;
      }
      if ((flags & 1) === 0) {
        if (family === 2) {
          addr = _htonl(2130706433);
        } else {
          addr = [0, 0, 0, 1];
        }
      }
      ai = allocaddrinfo(family, type, proto, null, addr, port);
      HEAP32[out >> 2] = ai;
      return 0;
    }
    node = Pointer_stringify(node);
    addr = __inet_pton4_raw(node);
    if (addr !== null) {
      if (family === 0 || family === 2) {
        family = 2;
      } else if (family === 10 && flags & 8) {
        addr = [0, 0, _htonl(65535), addr];
        family = 10;
      } else {
        return -2;
      }
    } else {
      addr = __inet_pton6_raw(node);
      if (addr !== null) {
        if (family === 0 || family === 10) {
          family = 10;
        } else {
          return -2;
        }
      }
    }
    if (addr != null) {
      ai = allocaddrinfo(family, type, proto, node, addr, port);
      HEAP32[out >> 2] = ai;
      return 0;
    }
    if (flags & 4) {
      return -2;
    }
    node = DNS.lookup_name(node);
    addr = __inet_pton4_raw(node);
    if (family === 0) {
      family = 2;
    } else if (family === 10) {
      addr = [0, 0, _htonl(65535), addr];
    }
    ai = allocaddrinfo(family, type, proto, null, addr, port);
    HEAP32[out >> 2] = ai;
    return 0;
  }
  var _tzname = STATICTOP;
  STATICTOP += 16;
  var _daylight = STATICTOP;
  STATICTOP += 16;
  var _timezone = STATICTOP;
  STATICTOP += 16;
  function _tzset() {
    if (_tzset.called) return;
    _tzset.called = true;
    HEAP32[_timezone >> 2] = -new Date().getTimezoneOffset() * 60;
    var winter = new Date(2e3, 0, 1);
    var summer = new Date(2e3, 6, 1);
    HEAP32[_daylight >> 2] = Number(winter.getTimezoneOffset() != summer.getTimezoneOffset());
    function extractZone(date) {
      var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
      return match ? match[1] : 'GMT';
    }
    var winterName = extractZone(winter);
    var summerName = extractZone(summer);
    var winterNamePtr = allocate(intArrayFromString(winterName), 'i8', ALLOC_NORMAL);
    var summerNamePtr = allocate(intArrayFromString(summerName), 'i8', ALLOC_NORMAL);
    if (summer.getTimezoneOffset() < winter.getTimezoneOffset()) {
      HEAP32[_tzname >> 2] = winterNamePtr;
      HEAP32[(_tzname + 4) >> 2] = summerNamePtr;
    } else {
      HEAP32[_tzname >> 2] = summerNamePtr;
      HEAP32[(_tzname + 4) >> 2] = winterNamePtr;
    }
  }
  var ERRNO_MESSAGES = {
    0: 'Success',
    1: 'Not super-user',
    2: 'No such file or directory',
    3: 'No such process',
    4: 'Interrupted system call',
    5: 'I/O error',
    6: 'No such device or address',
    7: 'Arg list too long',
    8: 'Exec format error',
    9: 'Bad file number',
    10: 'No children',
    11: 'No more processes',
    12: 'Not enough core',
    13: 'Permission denied',
    14: 'Bad address',
    15: 'Block device required',
    16: 'Mount device busy',
    17: 'File exists',
    18: 'Cross-device link',
    19: 'No such device',
    20: 'Not a directory',
    21: 'Is a directory',
    22: 'Invalid argument',
    23: 'Too many open files in system',
    24: 'Too many open files',
    25: 'Not a typewriter',
    26: 'Text file busy',
    27: 'File too large',
    28: 'No space left on device',
    29: 'Illegal seek',
    30: 'Read only file system',
    31: 'Too many links',
    32: 'Broken pipe',
    33: 'Math arg out of domain of func',
    34: 'Math result not representable',
    35: 'File locking deadlock error',
    36: 'File or path name too long',
    37: 'No record locks available',
    38: 'Function not implemented',
    39: 'Directory not empty',
    40: 'Too many symbolic links',
    42: 'No message of desired type',
    43: 'Identifier removed',
    44: 'Channel number out of range',
    45: 'Level 2 not synchronized',
    46: 'Level 3 halted',
    47: 'Level 3 reset',
    48: 'Link number out of range',
    49: 'Protocol driver not attached',
    50: 'No CSI structure available',
    51: 'Level 2 halted',
    52: 'Invalid exchange',
    53: 'Invalid request descriptor',
    54: 'Exchange full',
    55: 'No anode',
    56: 'Invalid request code',
    57: 'Invalid slot',
    59: 'Bad font file fmt',
    60: 'Device not a stream',
    61: 'No data (for no delay io)',
    62: 'Timer expired',
    63: 'Out of streams resources',
    64: 'Machine is not on the network',
    65: 'Package not installed',
    66: 'The object is remote',
    67: 'The link has been severed',
    68: 'Advertise error',
    69: 'Srmount error',
    70: 'Communication error on send',
    71: 'Protocol error',
    72: 'Multihop attempted',
    73: 'Cross mount point (not really error)',
    74: 'Trying to read unreadable message',
    75: 'Value too large for defined data type',
    76: 'Given log. name not unique',
    77: 'f.d. invalid for this operation',
    78: 'Remote address changed',
    79: 'Can   access a needed shared lib',
    80: 'Accessing a corrupted shared lib',
    81: '.lib section in a.out corrupted',
    82: 'Attempting to link in too many libs',
    83: 'Attempting to exec a shared library',
    84: 'Illegal byte sequence',
    86: 'Streams pipe error',
    87: 'Too many users',
    88: 'Socket operation on non-socket',
    89: 'Destination address required',
    90: 'Message too long',
    91: 'Protocol wrong type for socket',
    92: 'Protocol not available',
    93: 'Unknown protocol',
    94: 'Socket type not supported',
    95: 'Not supported',
    96: 'Protocol family not supported',
    97: 'Address family not supported by protocol family',
    98: 'Address already in use',
    99: 'Address not available',
    100: 'Network interface is not configured',
    101: 'Network is unreachable',
    102: 'Connection reset by network',
    103: 'Connection aborted',
    104: 'Connection reset by peer',
    105: 'No buffer space available',
    106: 'Socket is already connected',
    107: 'Socket is not connected',
    108: "Can't send after socket shutdown",
    109: 'Too many references',
    110: 'Connection timed out',
    111: 'Connection refused',
    112: 'Host is down',
    113: 'Host is unreachable',
    114: 'Socket already connected',
    115: 'Connection already in progress',
    116: 'Stale file handle',
    122: 'Quota exceeded',
    123: 'No medium (in tape drive)',
    125: 'Operation canceled',
    130: 'Previous owner died',
    131: 'State not recoverable',
  };
  var PATH = {
    splitPath: function (filename) {
      var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
      return splitPathRe.exec(filename).slice(1);
    },
    normalizeArray: function (parts, allowAboveRoot) {
      var up = 0;
      for (var i = parts.length - 1; i >= 0; i--) {
        var last = parts[i];
        if (last === '.') {
          parts.splice(i, 1);
        } else if (last === '..') {
          parts.splice(i, 1);
          up++;
        } else if (up) {
          parts.splice(i, 1);
          up--;
        }
      }
      if (allowAboveRoot) {
        for (; up--; up) {
          parts.unshift('..');
        }
      }
      return parts;
    },
    normalize: function (path) {
      var isAbsolute = path.charAt(0) === '/',
        trailingSlash = path.substr(-1) === '/';
      path = PATH.normalizeArray(
        path.split('/').filter(function (p) {
          return !!p;
        }),
        !isAbsolute,
      ).join('/');
      if (!path && !isAbsolute) {
        path = '.';
      }
      if (path && trailingSlash) {
        path += '/';
      }
      return (isAbsolute ? '/' : '') + path;
    },
    dirname: function (path) {
      var result = PATH.splitPath(path),
        root = result[0],
        dir = result[1];
      if (!root && !dir) {
        return '.';
      }
      if (dir) {
        dir = dir.substr(0, dir.length - 1);
      }
      return root + dir;
    },
    basename: function (path) {
      if (path === '/') return '/';
      var lastSlash = path.lastIndexOf('/');
      if (lastSlash === -1) return path;
      return path.substr(lastSlash + 1);
    },
    extname: function (path) {
      return PATH.splitPath(path)[3];
    },
    join: function () {
      var paths = Array.prototype.slice.call(arguments, 0);
      return PATH.normalize(paths.join('/'));
    },
    join2: function (l, r) {
      return PATH.normalize(l + '/' + r);
    },
    resolve: function () {
      var resolvedPath = '',
        resolvedAbsolute = false;
      for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        var path = i >= 0 ? arguments[i] : FS.cwd();
        if (typeof path !== 'string') {
          throw new TypeError('Arguments to path.resolve must be strings');
        } else if (!path) {
          return '';
        }
        resolvedPath = path + '/' + resolvedPath;
        resolvedAbsolute = path.charAt(0) === '/';
      }
      resolvedPath = PATH.normalizeArray(
        resolvedPath.split('/').filter(function (p) {
          return !!p;
        }),
        !resolvedAbsolute,
      ).join('/');
      return (resolvedAbsolute ? '/' : '') + resolvedPath || '.';
    },
    relative: function (from, to) {
      from = PATH.resolve(from).substr(1);
      to = PATH.resolve(to).substr(1);
      function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
          if (arr[start] !== '') break;
        }
        var end = arr.length - 1;
        for (; end >= 0; end--) {
          if (arr[end] !== '') break;
        }
        if (start > end) return [];
        return arr.slice(start, end - start + 1);
      }
      var fromParts = trim(from.split('/'));
      var toParts = trim(to.split('/'));
      var length = Math.min(fromParts.length, toParts.length);
      var samePartsLength = length;
      for (var i = 0; i < length; i++) {
        if (fromParts[i] !== toParts[i]) {
          samePartsLength = i;
          break;
        }
      }
      var outputParts = [];
      for (var i = samePartsLength; i < fromParts.length; i++) {
        outputParts.push('..');
      }
      outputParts = outputParts.concat(toParts.slice(samePartsLength));
      return outputParts.join('/');
    },
  };
  var TTY = {
    ttys: [],
    init: function () {},
    shutdown: function () {},
    register: function (dev, ops) {
      TTY.ttys[dev] = { input: [], output: [], ops: ops };
      FS.registerDevice(dev, TTY.stream_ops);
    },
    stream_ops: {
      open: function (stream) {
        var tty = TTY.ttys[stream.node.rdev];
        if (!tty) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        stream.tty = tty;
        stream.seekable = false;
      },
      close: function (stream) {
        stream.tty.ops.flush(stream.tty);
      },
      flush: function (stream) {
        stream.tty.ops.flush(stream.tty);
      },
      read: function (stream, buffer, offset, length, pos) {
        if (!stream.tty || !stream.tty.ops.get_char) {
          throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
        }
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = stream.tty.ops.get_char(stream.tty);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write: function (stream, buffer, offset, length, pos) {
        if (!stream.tty || !stream.tty.ops.put_char) {
          throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
        }
        for (var i = 0; i < length; i++) {
          try {
            stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      },
    },
    default_tty_ops: {
      get_char: function (tty) {
        if (!tty.input.length) {
          var result = null;
          if (ENVIRONMENT_IS_NODE) {
            var BUFSIZE = 256;
            var buf = new Buffer(BUFSIZE);
            var bytesRead = 0;
            var isPosixPlatform = process.platform != 'win32';
            var fd = process.stdin.fd;
            if (isPosixPlatform) {
              var usingDevice = false;
              try {
                fd = fs.openSync('/dev/stdin', 'r');
                usingDevice = true;
              } catch (e) {}
            }
            try {
              bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
            } catch (e) {
              if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
              else throw e;
            }
            if (usingDevice) {
              fs.closeSync(fd);
            }
            if (bytesRead > 0) {
              result = buf.slice(0, bytesRead).toString('utf-8');
            } else {
              result = null;
            }
          } else if (typeof window != 'undefined' && typeof window.prompt == 'function') {
            result = window.prompt('Input: ');
            if (result !== null) {
              result += '\n';
            }
          } else if (typeof readline == 'function') {
            result = readline();
            if (result !== null) {
              result += '\n';
            }
          }
          if (!result) {
            return null;
          }
          tty.input = intArrayFromString(result, true);
        }
        return tty.input.shift();
      },
      put_char: function (tty, val) {
        if (val === null || val === 10) {
          Module['print'](UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        } else {
          if (val != 0) tty.output.push(val);
        }
      },
      flush: function (tty) {
        if (tty.output && tty.output.length > 0) {
          Module['print'](UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        }
      },
    },
    default_tty1_ops: {
      put_char: function (tty, val) {
        if (val === null || val === 10) {
          Module['printErr'](UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        } else {
          if (val != 0) tty.output.push(val);
        }
      },
      flush: function (tty) {
        if (tty.output && tty.output.length > 0) {
          Module['printErr'](UTF8ArrayToString(tty.output, 0));
          tty.output = [];
        }
      },
    },
  };
  var MEMFS = {
    ops_table: null,
    mount: function (mount) {
      return MEMFS.createNode(null, '/', 16384 | 511, 0);
    },
    createNode: function (parent, name, mode, dev) {
      if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      if (!MEMFS.ops_table) {
        MEMFS.ops_table = {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink,
            },
            stream: { llseek: MEMFS.stream_ops.llseek },
          },
          file: {
            node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              allocate: MEMFS.stream_ops.allocate,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync,
            },
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink,
            },
            stream: {},
          },
          chrdev: {
            node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr },
            stream: FS.chrdev_stream_ops,
          },
        };
      }
      var node = FS.createNode(parent, name, mode, dev);
      if (FS.isDir(node.mode)) {
        node.node_ops = MEMFS.ops_table.dir.node;
        node.stream_ops = MEMFS.ops_table.dir.stream;
        node.contents = {};
      } else if (FS.isFile(node.mode)) {
        node.node_ops = MEMFS.ops_table.file.node;
        node.stream_ops = MEMFS.ops_table.file.stream;
        node.usedBytes = 0;
        node.contents = null;
      } else if (FS.isLink(node.mode)) {
        node.node_ops = MEMFS.ops_table.link.node;
        node.stream_ops = MEMFS.ops_table.link.stream;
      } else if (FS.isChrdev(node.mode)) {
        node.node_ops = MEMFS.ops_table.chrdev.node;
        node.stream_ops = MEMFS.ops_table.chrdev.stream;
      }
      node.timestamp = Date.now();
      if (parent) {
        parent.contents[name] = node;
      }
      return node;
    },
    getFileDataAsRegularArray: function (node) {
      if (node.contents && node.contents.subarray) {
        var arr = [];
        for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
        return arr;
      }
      return node.contents;
    },
    getFileDataAsTypedArray: function (node) {
      if (!node.contents) return new Uint8Array();
      if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
      return new Uint8Array(node.contents);
    },
    expandFileStorage: function (node, newCapacity) {
      if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
        node.contents = MEMFS.getFileDataAsRegularArray(node);
        node.usedBytes = node.contents.length;
      }
      if (!node.contents || node.contents.subarray) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(
          newCapacity,
          (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) | 0,
        );
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity);
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
        return;
      }
      if (!node.contents && newCapacity > 0) node.contents = [];
      while (node.contents.length < newCapacity) node.contents.push(0);
    },
    resizeFileStorage: function (node, newSize) {
      if (node.usedBytes == newSize) return;
      if (newSize == 0) {
        node.contents = null;
        node.usedBytes = 0;
        return;
      }
      if (!node.contents || node.contents.subarray) {
        var oldContents = node.contents;
        node.contents = new Uint8Array(new ArrayBuffer(newSize));
        if (oldContents) {
          node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
        }
        node.usedBytes = newSize;
        return;
      }
      if (!node.contents) node.contents = [];
      if (node.contents.length > newSize) node.contents.length = newSize;
      else while (node.contents.length < newSize) node.contents.push(0);
      node.usedBytes = newSize;
    },
    node_ops: {
      getattr: function (node) {
        var attr = {};
        attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
        attr.ino = node.id;
        attr.mode = node.mode;
        attr.nlink = 1;
        attr.uid = 0;
        attr.gid = 0;
        attr.rdev = node.rdev;
        if (FS.isDir(node.mode)) {
          attr.size = 4096;
        } else if (FS.isFile(node.mode)) {
          attr.size = node.usedBytes;
        } else if (FS.isLink(node.mode)) {
          attr.size = node.link.length;
        } else {
          attr.size = 0;
        }
        attr.atime = new Date(node.timestamp);
        attr.mtime = new Date(node.timestamp);
        attr.ctime = new Date(node.timestamp);
        attr.blksize = 4096;
        attr.blocks = Math.ceil(attr.size / attr.blksize);
        return attr;
      },
      setattr: function (node, attr) {
        if (attr.mode !== undefined) {
          node.mode = attr.mode;
        }
        if (attr.timestamp !== undefined) {
          node.timestamp = attr.timestamp;
        }
        if (attr.size !== undefined) {
          MEMFS.resizeFileStorage(node, attr.size);
        }
      },
      lookup: function (parent, name) {
        throw FS.genericErrors[ERRNO_CODES.ENOENT];
      },
      mknod: function (parent, name, mode, dev) {
        return MEMFS.createNode(parent, name, mode, dev);
      },
      rename: function (old_node, new_dir, new_name) {
        if (FS.isDir(old_node.mode)) {
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {}
          if (new_node) {
            for (var i in new_node.contents) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
            }
          }
        }
        delete old_node.parent.contents[old_node.name];
        old_node.name = new_name;
        new_dir.contents[new_name] = old_node;
        old_node.parent = new_dir;
      },
      unlink: function (parent, name) {
        delete parent.contents[name];
      },
      rmdir: function (parent, name) {
        var node = FS.lookupNode(parent, name);
        for (var i in node.contents) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        delete parent.contents[name];
      },
      readdir: function (node) {
        var entries = ['.', '..'];
        for (var key in node.contents) {
          if (!node.contents.hasOwnProperty(key)) {
            continue;
          }
          entries.push(key);
        }
        return entries;
      },
      symlink: function (parent, newname, oldpath) {
        var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
        node.link = oldpath;
        return node;
      },
      readlink: function (node) {
        if (!FS.isLink(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return node.link;
      },
    },
    stream_ops: {
      read: function (stream, buffer, offset, length, position) {
        var contents = stream.node.contents;
        if (position >= stream.node.usedBytes) return 0;
        var size = Math.min(stream.node.usedBytes - position, length);
        assert(size >= 0);
        if (size > 8 && contents.subarray) {
          buffer.set(contents.subarray(position, position + size), offset);
        } else {
          for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
        }
        return size;
      },
      write: function (stream, buffer, offset, length, position, canOwn) {
        if (!length) return 0;
        var node = stream.node;
        node.timestamp = Date.now();
        if (buffer.subarray && (!node.contents || node.contents.subarray)) {
          if (canOwn) {
            node.contents = buffer.subarray(offset, offset + length);
            node.usedBytes = length;
            return length;
          } else if (node.usedBytes === 0 && position === 0) {
            node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
            node.usedBytes = length;
            return length;
          } else if (position + length <= node.usedBytes) {
            node.contents.set(buffer.subarray(offset, offset + length), position);
            return length;
          }
        }
        MEMFS.expandFileStorage(node, position + length);
        if (node.contents.subarray && buffer.subarray)
          node.contents.set(buffer.subarray(offset, offset + length), position);
        else {
          for (var i = 0; i < length; i++) {
            node.contents[position + i] = buffer[offset + i];
          }
        }
        node.usedBytes = Math.max(node.usedBytes, position + length);
        return length;
      },
      llseek: function (stream, offset, whence) {
        var position = offset;
        if (whence === 1) {
          position += stream.position;
        } else if (whence === 2) {
          if (FS.isFile(stream.node.mode)) {
            position += stream.node.usedBytes;
          }
        }
        if (position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return position;
      },
      allocate: function (stream, offset, length) {
        MEMFS.expandFileStorage(stream.node, offset + length);
        stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
      },
      mmap: function (stream, buffer, offset, length, position, prot, flags) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        var ptr;
        var allocated;
        var contents = stream.node.contents;
        if (!(flags & 2) && (contents.buffer === buffer || contents.buffer === buffer.buffer)) {
          allocated = false;
          ptr = contents.byteOffset;
        } else {
          if (position > 0 || position + length < stream.node.usedBytes) {
            if (contents.subarray) {
              contents = contents.subarray(position, position + length);
            } else {
              contents = Array.prototype.slice.call(contents, position, position + length);
            }
          }
          allocated = true;
          ptr = _malloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
          }
          buffer.set(contents, ptr);
        }
        return { ptr: ptr, allocated: allocated };
      },
      msync: function (stream, buffer, offset, length, mmapFlags) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (mmapFlags & 2) {
          return 0;
        }
        var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
        return 0;
      },
    },
  };
  var IDBFS = {
    dbs: {},
    indexedDB: function () {
      if (typeof indexedDB !== 'undefined') return indexedDB;
      var ret = null;
      if (typeof window === 'object')
        ret =
          window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      assert(ret, 'IDBFS used, but indexedDB not supported');
      return ret;
    },
    DB_VERSION: 21,
    DB_STORE_NAME: 'FILE_DATA',
    mount: function (mount) {
      return MEMFS.mount.apply(null, arguments);
    },
    syncfs: function (mount, populate, callback) {
      IDBFS.getLocalSet(mount, function (err, local) {
        if (err) return callback(err);
        IDBFS.getRemoteSet(mount, function (err, remote) {
          if (err) return callback(err);
          var src = populate ? remote : local;
          var dst = populate ? local : remote;
          IDBFS.reconcile(src, dst, callback);
        });
      });
    },
    getDB: function (name, callback) {
      var db = IDBFS.dbs[name];
      if (db) {
        return callback(null, db);
      }
      var req;
      try {
        req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
      } catch (e) {
        return callback(e);
      }
      if (!req) {
        return callback('Unable to connect to IndexedDB');
      }
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        var transaction = e.target.transaction;
        var fileStore;
        if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
          fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
        } else {
          fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
        }
        if (!fileStore.indexNames.contains('timestamp')) {
          fileStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = function () {
        db = req.result;
        IDBFS.dbs[name] = db;
        callback(null, db);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    getLocalSet: function (mount, callback) {
      var entries = {};
      function isRealDir(p) {
        return p !== '.' && p !== '..';
      }
      function toAbsolute(root) {
        return function (p) {
          return PATH.join2(root, p);
        };
      }
      var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
      while (check.length) {
        var path = check.pop();
        var stat;
        try {
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
        if (FS.isDir(stat.mode)) {
          check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
        }
        entries[path] = { timestamp: stat.mtime };
      }
      return callback(null, { type: 'local', entries: entries });
    },
    getRemoteSet: function (mount, callback) {
      var entries = {};
      IDBFS.getDB(mount.mountpoint, function (err, db) {
        if (err) return callback(err);
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
        transaction.onerror = function (e) {
          callback(this.error);
          e.preventDefault();
        };
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
        var index = store.index('timestamp');
        index.openKeyCursor().onsuccess = function (event) {
          var cursor = event.target.result;
          if (!cursor) {
            return callback(null, { type: 'remote', db: db, entries: entries });
          }
          entries[cursor.primaryKey] = { timestamp: cursor.key };
          cursor.continue();
        };
      });
    },
    loadLocalEntry: function (path, callback) {
      var stat, node;
      try {
        var lookup = FS.lookupPath(path);
        node = lookup.node;
        stat = FS.stat(path);
      } catch (e) {
        return callback(e);
      }
      if (FS.isDir(stat.mode)) {
        return callback(null, { timestamp: stat.mtime, mode: stat.mode });
      } else if (FS.isFile(stat.mode)) {
        node.contents = MEMFS.getFileDataAsTypedArray(node);
        return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
      } else {
        return callback(new Error('node type not supported'));
      }
    },
    storeLocalEntry: function (path, entry, callback) {
      try {
        if (FS.isDir(entry.mode)) {
          FS.mkdir(path, entry.mode);
        } else if (FS.isFile(entry.mode)) {
          FS.writeFile(path, entry.contents, { encoding: 'binary', canOwn: true });
        } else {
          return callback(new Error('node type not supported'));
        }
        FS.chmod(path, entry.mode);
        FS.utime(path, entry.timestamp, entry.timestamp);
      } catch (e) {
        return callback(e);
      }
      callback(null);
    },
    removeLocalEntry: function (path, callback) {
      try {
        var lookup = FS.lookupPath(path);
        var stat = FS.stat(path);
        if (FS.isDir(stat.mode)) {
          FS.rmdir(path);
        } else if (FS.isFile(stat.mode)) {
          FS.unlink(path);
        }
      } catch (e) {
        return callback(e);
      }
      callback(null);
    },
    loadRemoteEntry: function (store, path, callback) {
      var req = store.get(path);
      req.onsuccess = function (event) {
        callback(null, event.target.result);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    storeRemoteEntry: function (store, path, entry, callback) {
      var req = store.put(entry, path);
      req.onsuccess = function () {
        callback(null);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    removeRemoteEntry: function (store, path, callback) {
      var req = store.delete(path);
      req.onsuccess = function () {
        callback(null);
      };
      req.onerror = function (e) {
        callback(this.error);
        e.preventDefault();
      };
    },
    reconcile: function (src, dst, callback) {
      var total = 0;
      var create = [];
      Object.keys(src.entries).forEach(function (key) {
        var e = src.entries[key];
        var e2 = dst.entries[key];
        if (!e2 || e.timestamp > e2.timestamp) {
          create.push(key);
          total++;
        }
      });
      var remove = [];
      Object.keys(dst.entries).forEach(function (key) {
        var e = dst.entries[key];
        var e2 = src.entries[key];
        if (!e2) {
          remove.push(key);
          total++;
        }
      });
      if (!total) {
        return callback(null);
      }
      var completed = 0;
      var db = src.type === 'remote' ? src.db : dst.db;
      var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
      var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
      function done(err) {
        if (err) {
          if (!done.errored) {
            done.errored = true;
            return callback(err);
          }
          return;
        }
        if (++completed >= total) {
          return callback(null);
        }
      }
      transaction.onerror = function (e) {
        done(this.error);
        e.preventDefault();
      };
      create.sort().forEach(function (path) {
        if (dst.type === 'local') {
          IDBFS.loadRemoteEntry(store, path, function (err, entry) {
            if (err) return done(err);
            IDBFS.storeLocalEntry(path, entry, done);
          });
        } else {
          IDBFS.loadLocalEntry(path, function (err, entry) {
            if (err) return done(err);
            IDBFS.storeRemoteEntry(store, path, entry, done);
          });
        }
      });
      remove
        .sort()
        .reverse()
        .forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
    },
  };
  var NODEFS = {
    isWindows: false,
    staticInit: function () {
      NODEFS.isWindows = !!process.platform.match(/^win/);
    },
    mount: function (mount) {
      assert(ENVIRONMENT_IS_NODE);
      return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
    },
    createNode: function (parent, name, mode, dev) {
      if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var node = FS.createNode(parent, name, mode);
      node.node_ops = NODEFS.node_ops;
      node.stream_ops = NODEFS.stream_ops;
      return node;
    },
    getMode: function (path) {
      var stat;
      try {
        stat = fs.lstatSync(path);
        if (NODEFS.isWindows) {
          stat.mode = stat.mode | ((stat.mode & 146) >> 1);
        }
      } catch (e) {
        if (!e.code) throw e;
        throw new FS.ErrnoError(ERRNO_CODES[e.code]);
      }
      return stat.mode;
    },
    realPath: function (node) {
      var parts = [];
      while (node.parent !== node) {
        parts.push(node.name);
        node = node.parent;
      }
      parts.push(node.mount.opts.root);
      parts.reverse();
      return PATH.join.apply(null, parts);
    },
    flagsToPermissionStringMap: {
      0: 'r',
      1: 'r+',
      2: 'r+',
      64: 'r',
      65: 'r+',
      66: 'r+',
      129: 'rx+',
      193: 'rx+',
      514: 'w+',
      577: 'w',
      578: 'w+',
      705: 'wx',
      706: 'wx+',
      1024: 'a',
      1025: 'a',
      1026: 'a+',
      1089: 'a',
      1090: 'a+',
      1153: 'ax',
      1154: 'ax+',
      1217: 'ax',
      1218: 'ax+',
      4096: 'rs',
      4098: 'rs+',
    },
    flagsToPermissionString: function (flags) {
      flags &= ~2097152;
      flags &= ~2048;
      flags &= ~32768;
      flags &= ~524288;
      if (flags in NODEFS.flagsToPermissionStringMap) {
        return NODEFS.flagsToPermissionStringMap[flags];
      } else {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
    },
    node_ops: {
      getattr: function (node) {
        var path = NODEFS.realPath(node);
        var stat;
        try {
          stat = fs.lstatSync(path);
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        if (NODEFS.isWindows && !stat.blksize) {
          stat.blksize = 4096;
        }
        if (NODEFS.isWindows && !stat.blocks) {
          stat.blocks = ((stat.size + stat.blksize - 1) / stat.blksize) | 0;
        }
        return {
          dev: stat.dev,
          ino: stat.ino,
          mode: stat.mode,
          nlink: stat.nlink,
          uid: stat.uid,
          gid: stat.gid,
          rdev: stat.rdev,
          size: stat.size,
          atime: stat.atime,
          mtime: stat.mtime,
          ctime: stat.ctime,
          blksize: stat.blksize,
          blocks: stat.blocks,
        };
      },
      setattr: function (node, attr) {
        var path = NODEFS.realPath(node);
        try {
          if (attr.mode !== undefined) {
            fs.chmodSync(path, attr.mode);
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            var date = new Date(attr.timestamp);
            fs.utimesSync(path, date, date);
          }
          if (attr.size !== undefined) {
            fs.truncateSync(path, attr.size);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      lookup: function (parent, name) {
        var path = PATH.join2(NODEFS.realPath(parent), name);
        var mode = NODEFS.getMode(path);
        return NODEFS.createNode(parent, name, mode);
      },
      mknod: function (parent, name, mode, dev) {
        var node = NODEFS.createNode(parent, name, mode, dev);
        var path = NODEFS.realPath(node);
        try {
          if (FS.isDir(node.mode)) {
            fs.mkdirSync(path, node.mode);
          } else {
            fs.writeFileSync(path, '', { mode: node.mode });
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return node;
      },
      rename: function (oldNode, newDir, newName) {
        var oldPath = NODEFS.realPath(oldNode);
        var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
        try {
          fs.renameSync(oldPath, newPath);
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      unlink: function (parent, name) {
        var path = PATH.join2(NODEFS.realPath(parent), name);
        try {
          fs.unlinkSync(path);
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      rmdir: function (parent, name) {
        var path = PATH.join2(NODEFS.realPath(parent), name);
        try {
          fs.rmdirSync(path);
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      readdir: function (node) {
        var path = NODEFS.realPath(node);
        try {
          return fs.readdirSync(path);
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      symlink: function (parent, newName, oldPath) {
        var newPath = PATH.join2(NODEFS.realPath(parent), newName);
        try {
          fs.symlinkSync(oldPath, newPath);
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      readlink: function (node) {
        var path = NODEFS.realPath(node);
        try {
          path = fs.readlinkSync(path);
          path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
          return path;
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
    },
    stream_ops: {
      open: function (stream) {
        var path = NODEFS.realPath(stream.node);
        try {
          if (FS.isFile(stream.node.mode)) {
            stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags));
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      close: function (stream) {
        try {
          if (FS.isFile(stream.node.mode) && stream.nfd) {
            fs.closeSync(stream.nfd);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
      },
      read: function (stream, buffer, offset, length, position) {
        if (length === 0) return 0;
        var nbuffer = new Buffer(length);
        var res;
        try {
          res = fs.readSync(stream.nfd, nbuffer, 0, length, position);
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        if (res > 0) {
          for (var i = 0; i < res; i++) {
            buffer[offset + i] = nbuffer[i];
          }
        }
        return res;
      },
      write: function (stream, buffer, offset, length, position) {
        var nbuffer = new Buffer(buffer.subarray(offset, offset + length));
        var res;
        try {
          res = fs.writeSync(stream.nfd, nbuffer, 0, length, position);
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return res;
      },
      llseek: function (stream, offset, whence) {
        var position = offset;
        if (whence === 1) {
          position += stream.position;
        } else if (whence === 2) {
          if (FS.isFile(stream.node.mode)) {
            try {
              var stat = fs.fstatSync(stream.nfd);
              position += stat.size;
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES[e.code]);
            }
          }
        }
        if (position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return position;
      },
    },
  };
  var WORKERFS = {
    DIR_MODE: 16895,
    FILE_MODE: 33279,
    reader: null,
    mount: function (mount) {
      assert(ENVIRONMENT_IS_WORKER);
      if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
      var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
      var createdParents = {};
      function ensureParent(path) {
        var parts = path.split('/');
        var parent = root;
        for (var i = 0; i < parts.length - 1; i++) {
          var curr = parts.slice(0, i + 1).join('/');
          if (!createdParents[curr]) {
            createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
          }
          parent = createdParents[curr];
        }
        return parent;
      }
      function base(path) {
        var parts = path.split('/');
        return parts[parts.length - 1];
      }
      Array.prototype.forEach.call(mount.opts['files'] || [], function (file) {
        WORKERFS.createNode(
          ensureParent(file.name),
          base(file.name),
          WORKERFS.FILE_MODE,
          0,
          file,
          file.lastModifiedDate,
        );
      });
      (mount.opts['blobs'] || []).forEach(function (obj) {
        WORKERFS.createNode(
          ensureParent(obj['name']),
          base(obj['name']),
          WORKERFS.FILE_MODE,
          0,
          obj['data'],
        );
      });
      (mount.opts['packages'] || []).forEach(function (pack) {
        pack['metadata'].files.forEach(function (file) {
          var name = file.filename.substr(1);
          WORKERFS.createNode(
            ensureParent(name),
            base(name),
            WORKERFS.FILE_MODE,
            0,
            pack['blob'].slice(file.start, file.end),
          );
        });
      });
      return root;
    },
    createNode: function (parent, name, mode, dev, contents, mtime) {
      var node = FS.createNode(parent, name, mode);
      node.mode = mode;
      node.node_ops = WORKERFS.node_ops;
      node.stream_ops = WORKERFS.stream_ops;
      node.timestamp = (mtime || new Date()).getTime();
      assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
      if (mode === WORKERFS.FILE_MODE) {
        node.size = contents.size;
        node.contents = contents;
      } else {
        node.size = 4096;
        node.contents = {};
      }
      if (parent) {
        parent.contents[name] = node;
      }
      return node;
    },
    node_ops: {
      getattr: function (node) {
        return {
          dev: 1,
          ino: undefined,
          mode: node.mode,
          nlink: 1,
          uid: 0,
          gid: 0,
          rdev: undefined,
          size: node.size,
          atime: new Date(node.timestamp),
          mtime: new Date(node.timestamp),
          ctime: new Date(node.timestamp),
          blksize: 4096,
          blocks: Math.ceil(node.size / 4096),
        };
      },
      setattr: function (node, attr) {
        if (attr.mode !== undefined) {
          node.mode = attr.mode;
        }
        if (attr.timestamp !== undefined) {
          node.timestamp = attr.timestamp;
        }
      },
      lookup: function (parent, name) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      },
      mknod: function (parent, name, mode, dev) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      },
      rename: function (oldNode, newDir, newName) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      },
      unlink: function (parent, name) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      },
      rmdir: function (parent, name) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      },
      readdir: function (node) {
        var entries = ['.', '..'];
        for (var key in node.contents) {
          if (!node.contents.hasOwnProperty(key)) {
            continue;
          }
          entries.push(key);
        }
        return entries;
      },
      symlink: function (parent, newName, oldPath) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      },
      readlink: function (node) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      },
    },
    stream_ops: {
      read: function (stream, buffer, offset, length, position) {
        if (position >= stream.node.size) return 0;
        var chunk = stream.node.contents.slice(position, position + length);
        var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
        buffer.set(new Uint8Array(ab), offset);
        return chunk.size;
      },
      write: function (stream, buffer, offset, length, position) {
        throw new FS.ErrnoError(ERRNO_CODES.EIO);
      },
      llseek: function (stream, offset, whence) {
        var position = offset;
        if (whence === 1) {
          position += stream.position;
        } else if (whence === 2) {
          if (FS.isFile(stream.node.mode)) {
            position += stream.node.size;
          }
        }
        if (position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return position;
      },
    },
  };
  STATICTOP += 16;
  STATICTOP += 16;
  STATICTOP += 16;
  var FS = {
    root: null,
    mounts: [],
    devices: [null],
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: '/',
    initialized: false,
    ignorePermissions: true,
    trackingDelegate: {},
    tracking: { openFlags: { READ: 1, WRITE: 2 } },
    ErrnoError: null,
    genericErrors: {},
    filesystems: null,
    syncFSRequests: 0,
    handleFSError: function (e) {
      if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
      return ___setErrNo(e.errno);
    },
    lookupPath: function (path, opts) {
      path = PATH.resolve(FS.cwd(), path);
      opts = opts || {};
      if (!path) return { path: '', node: null };
      var defaults = { follow_mount: true, recurse_count: 0 };
      for (var key in defaults) {
        if (opts[key] === undefined) {
          opts[key] = defaults[key];
        }
      }
      if (opts.recurse_count > 8) {
        throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
      }
      var parts = PATH.normalizeArray(
        path.split('/').filter(function (p) {
          return !!p;
        }),
        false,
      );
      var current = FS.root;
      var current_path = '/';
      for (var i = 0; i < parts.length; i++) {
        var islast = i === parts.length - 1;
        if (islast && opts.parent) {
          break;
        }
        current = FS.lookupNode(current, parts[i]);
        current_path = PATH.join2(current_path, parts[i]);
        if (FS.isMountpoint(current)) {
          if (!islast || (islast && opts.follow_mount)) {
            current = current.mounted.root;
          }
        }
        if (!islast || opts.follow) {
          var count = 0;
          while (FS.isLink(current.mode)) {
            var link = FS.readlink(current_path);
            current_path = PATH.resolve(PATH.dirname(current_path), link);
            var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
            current = lookup.node;
            if (count++ > 40) {
              throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
            }
          }
        }
      }
      return { path: current_path, node: current };
    },
    getPath: function (node) {
      var path;
      while (true) {
        if (FS.isRoot(node)) {
          var mount = node.mount.mountpoint;
          if (!path) return mount;
          return mount[mount.length - 1] !== '/' ? mount + '/' + path : mount + path;
        }
        path = path ? node.name + '/' + path : node.name;
        node = node.parent;
      }
    },
    hashName: function (parentid, name) {
      var hash = 0;
      for (var i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
      }
      return ((parentid + hash) >>> 0) % FS.nameTable.length;
    },
    hashAddNode: function (node) {
      var hash = FS.hashName(node.parent.id, node.name);
      node.name_next = FS.nameTable[hash];
      FS.nameTable[hash] = node;
    },
    hashRemoveNode: function (node) {
      var hash = FS.hashName(node.parent.id, node.name);
      if (FS.nameTable[hash] === node) {
        FS.nameTable[hash] = node.name_next;
      } else {
        var current = FS.nameTable[hash];
        while (current) {
          if (current.name_next === node) {
            current.name_next = node.name_next;
            break;
          }
          current = current.name_next;
        }
      }
    },
    lookupNode: function (parent, name) {
      var err = FS.mayLookup(parent);
      if (err) {
        throw new FS.ErrnoError(err, parent);
      }
      var hash = FS.hashName(parent.id, name);
      for (var node = FS.nameTable[hash]; node; node = node.name_next) {
        var nodeName = node.name;
        if (node.parent.id === parent.id && nodeName === name) {
          return node;
        }
      }
      return FS.lookup(parent, name);
    },
    createNode: function (parent, name, mode, rdev) {
      if (!FS.FSNode) {
        FS.FSNode = function (parent, name, mode, rdev) {
          if (!parent) {
            parent = this;
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.mounted = null;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.node_ops = {};
          this.stream_ops = {};
          this.rdev = rdev;
        };
        FS.FSNode.prototype = {};
        var readMode = 292 | 73;
        var writeMode = 146;
        Object.defineProperties(FS.FSNode.prototype, {
          read: {
            get: function () {
              return (this.mode & readMode) === readMode;
            },
            set: function (val) {
              val ? (this.mode |= readMode) : (this.mode &= ~readMode);
            },
          },
          write: {
            get: function () {
              return (this.mode & writeMode) === writeMode;
            },
            set: function (val) {
              val ? (this.mode |= writeMode) : (this.mode &= ~writeMode);
            },
          },
          isFolder: {
            get: function () {
              return FS.isDir(this.mode);
            },
          },
          isDevice: {
            get: function () {
              return FS.isChrdev(this.mode);
            },
          },
        });
      }
      var node = new FS.FSNode(parent, name, mode, rdev);
      FS.hashAddNode(node);
      return node;
    },
    destroyNode: function (node) {
      FS.hashRemoveNode(node);
    },
    isRoot: function (node) {
      return node === node.parent;
    },
    isMountpoint: function (node) {
      return !!node.mounted;
    },
    isFile: function (mode) {
      return (mode & 61440) === 32768;
    },
    isDir: function (mode) {
      return (mode & 61440) === 16384;
    },
    isLink: function (mode) {
      return (mode & 61440) === 40960;
    },
    isChrdev: function (mode) {
      return (mode & 61440) === 8192;
    },
    isBlkdev: function (mode) {
      return (mode & 61440) === 24576;
    },
    isFIFO: function (mode) {
      return (mode & 61440) === 4096;
    },
    isSocket: function (mode) {
      return (mode & 49152) === 49152;
    },
    flagModes: {
      r: 0,
      rs: 1052672,
      'r+': 2,
      w: 577,
      wx: 705,
      xw: 705,
      'w+': 578,
      'wx+': 706,
      'xw+': 706,
      a: 1089,
      ax: 1217,
      xa: 1217,
      'a+': 1090,
      'ax+': 1218,
      'xa+': 1218,
    },
    modeStringToFlags: function (str) {
      var flags = FS.flagModes[str];
      if (typeof flags === 'undefined') {
        throw new Error('Unknown file open mode: ' + str);
      }
      return flags;
    },
    flagsToPermissionString: function (flag) {
      var perms = ['r', 'w', 'rw'][flag & 3];
      if (flag & 512) {
        perms += 'w';
      }
      return perms;
    },
    nodePermissions: function (node, perms) {
      if (FS.ignorePermissions) {
        return 0;
      }
      if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
        return ERRNO_CODES.EACCES;
      } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
        return ERRNO_CODES.EACCES;
      } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
        return ERRNO_CODES.EACCES;
      }
      return 0;
    },
    mayLookup: function (dir) {
      var err = FS.nodePermissions(dir, 'x');
      if (err) return err;
      if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
      return 0;
    },
    mayCreate: function (dir, name) {
      try {
        var node = FS.lookupNode(dir, name);
        return ERRNO_CODES.EEXIST;
      } catch (e) {}
      return FS.nodePermissions(dir, 'wx');
    },
    mayDelete: function (dir, name, isdir) {
      var node;
      try {
        node = FS.lookupNode(dir, name);
      } catch (e) {
        return e.errno;
      }
      var err = FS.nodePermissions(dir, 'wx');
      if (err) {
        return err;
      }
      if (isdir) {
        if (!FS.isDir(node.mode)) {
          return ERRNO_CODES.ENOTDIR;
        }
        if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
          return ERRNO_CODES.EBUSY;
        }
      } else {
        if (FS.isDir(node.mode)) {
          return ERRNO_CODES.EISDIR;
        }
      }
      return 0;
    },
    mayOpen: function (node, flags) {
      if (!node) {
        return ERRNO_CODES.ENOENT;
      }
      if (FS.isLink(node.mode)) {
        return ERRNO_CODES.ELOOP;
      } else if (FS.isDir(node.mode)) {
        if (FS.flagsToPermissionString(flags) !== 'r' || flags & 512) {
          return ERRNO_CODES.EISDIR;
        }
      }
      return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
    },
    MAX_OPEN_FDS: 4096,
    nextfd: function (fd_start, fd_end) {
      fd_start = fd_start || 0;
      fd_end = fd_end || FS.MAX_OPEN_FDS;
      for (var fd = fd_start; fd <= fd_end; fd++) {
        if (!FS.streams[fd]) {
          return fd;
        }
      }
      throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
    },
    getStream: function (fd) {
      return FS.streams[fd];
    },
    createStream: function (stream, fd_start, fd_end) {
      if (!FS.FSStream) {
        FS.FSStream = function () {};
        FS.FSStream.prototype = {};
        Object.defineProperties(FS.FSStream.prototype, {
          object: {
            get: function () {
              return this.node;
            },
            set: function (val) {
              this.node = val;
            },
          },
          isRead: {
            get: function () {
              return (this.flags & 2097155) !== 1;
            },
          },
          isWrite: {
            get: function () {
              return (this.flags & 2097155) !== 0;
            },
          },
          isAppend: {
            get: function () {
              return this.flags & 1024;
            },
          },
        });
      }
      var newStream = new FS.FSStream();
      for (var p in stream) {
        newStream[p] = stream[p];
      }
      stream = newStream;
      var fd = FS.nextfd(fd_start, fd_end);
      stream.fd = fd;
      FS.streams[fd] = stream;
      return stream;
    },
    closeStream: function (fd) {
      FS.streams[fd] = null;
    },
    chrdev_stream_ops: {
      open: function (stream) {
        var device = FS.getDevice(stream.node.rdev);
        stream.stream_ops = device.stream_ops;
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
      },
      llseek: function () {
        throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
      },
    },
    major: function (dev) {
      return dev >> 8;
    },
    minor: function (dev) {
      return dev & 255;
    },
    makedev: function (ma, mi) {
      return (ma << 8) | mi;
    },
    registerDevice: function (dev, ops) {
      FS.devices[dev] = { stream_ops: ops };
    },
    getDevice: function (dev) {
      return FS.devices[dev];
    },
    getMounts: function (mount) {
      var mounts = [];
      var check = [mount];
      while (check.length) {
        var m = check.pop();
        mounts.push(m);
        check.push.apply(check, m.mounts);
      }
      return mounts;
    },
    syncfs: function (populate, callback) {
      if (typeof populate === 'function') {
        callback = populate;
        populate = false;
      }
      FS.syncFSRequests++;
      if (FS.syncFSRequests > 1) {
        console.log(
          'warning: ' +
            FS.syncFSRequests +
            ' FS.syncfs operations in flight at once, probably just doing extra work',
        );
      }
      var mounts = FS.getMounts(FS.root.mount);
      var completed = 0;
      function doCallback(err) {
        assert(FS.syncFSRequests > 0);
        FS.syncFSRequests--;
        return callback(err);
      }
      function done(err) {
        if (err) {
          if (!done.errored) {
            done.errored = true;
            return doCallback(err);
          }
          return;
        }
        if (++completed >= mounts.length) {
          doCallback(null);
        }
      }
      mounts.forEach(function (mount) {
        if (!mount.type.syncfs) {
          return done(null);
        }
        mount.type.syncfs(mount, populate, done);
      });
    },
    mount: function (type, opts, mountpoint) {
      var root = mountpoint === '/';
      var pseudo = !mountpoint;
      var node;
      if (root && FS.root) {
        throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
      } else if (!root && !pseudo) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
        mountpoint = lookup.path;
        node = lookup.node;
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
      }
      var mount = { type: type, opts: opts, mountpoint: mountpoint, mounts: [] };
      var mountRoot = type.mount(mount);
      mountRoot.mount = mount;
      mount.root = mountRoot;
      if (root) {
        FS.root = mountRoot;
      } else if (node) {
        node.mounted = mount;
        if (node.mount) {
          node.mount.mounts.push(mount);
        }
      }
      return mountRoot;
    },
    unmount: function (mountpoint) {
      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
      if (!FS.isMountpoint(lookup.node)) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var node = lookup.node;
      var mount = node.mounted;
      var mounts = FS.getMounts(mount);
      Object.keys(FS.nameTable).forEach(function (hash) {
        var current = FS.nameTable[hash];
        while (current) {
          var next = current.name_next;
          if (mounts.indexOf(current.mount) !== -1) {
            FS.destroyNode(current);
          }
          current = next;
        }
      });
      node.mounted = null;
      var idx = node.mount.mounts.indexOf(mount);
      assert(idx !== -1);
      node.mount.mounts.splice(idx, 1);
    },
    lookup: function (parent, name) {
      return parent.node_ops.lookup(parent, name);
    },
    mknod: function (path, mode, dev) {
      var lookup = FS.lookupPath(path, { parent: true });
      var parent = lookup.node;
      var name = PATH.basename(path);
      if (!name || name === '.' || name === '..') {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var err = FS.mayCreate(parent, name);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.mknod) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      return parent.node_ops.mknod(parent, name, mode, dev);
    },
    create: function (path, mode) {
      mode = mode !== undefined ? mode : 438;
      mode &= 4095;
      mode |= 32768;
      return FS.mknod(path, mode, 0);
    },
    mkdir: function (path, mode) {
      mode = mode !== undefined ? mode : 511;
      mode &= 511 | 512;
      mode |= 16384;
      return FS.mknod(path, mode, 0);
    },
    mkdirTree: function (path, mode) {
      var dirs = path.split('/');
      var d = '';
      for (var i = 0; i < dirs.length; ++i) {
        if (!dirs[i]) continue;
        d += '/' + dirs[i];
        try {
          FS.mkdir(d, mode);
        } catch (e) {
          if (e.errno != ERRNO_CODES.EEXIST) throw e;
        }
      }
    },
    mkdev: function (path, mode, dev) {
      if (typeof dev === 'undefined') {
        dev = mode;
        mode = 438;
      }
      mode |= 8192;
      return FS.mknod(path, mode, dev);
    },
    symlink: function (oldpath, newpath) {
      if (!PATH.resolve(oldpath)) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      }
      var lookup = FS.lookupPath(newpath, { parent: true });
      var parent = lookup.node;
      if (!parent) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      }
      var newname = PATH.basename(newpath);
      var err = FS.mayCreate(parent, newname);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.symlink) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      return parent.node_ops.symlink(parent, newname, oldpath);
    },
    rename: function (old_path, new_path) {
      var old_dirname = PATH.dirname(old_path);
      var new_dirname = PATH.dirname(new_path);
      var old_name = PATH.basename(old_path);
      var new_name = PATH.basename(new_path);
      var lookup, old_dir, new_dir;
      try {
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
      } catch (e) {
        throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
      }
      if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      if (old_dir.mount !== new_dir.mount) {
        throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
      }
      var old_node = FS.lookupNode(old_dir, old_name);
      var relative = PATH.relative(old_path, new_dirname);
      if (relative.charAt(0) !== '.') {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      relative = PATH.relative(new_path, old_dirname);
      if (relative.charAt(0) !== '.') {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
      }
      var new_node;
      try {
        new_node = FS.lookupNode(new_dir, new_name);
      } catch (e) {}
      if (old_node === new_node) {
        return;
      }
      var isdir = FS.isDir(old_node.mode);
      var err = FS.mayDelete(old_dir, old_name, isdir);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      err = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!old_dir.node_ops.rename) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
        throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
      }
      if (new_dir !== old_dir) {
        err = FS.nodePermissions(old_dir, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
      }
      try {
        if (FS.trackingDelegate['willMovePath']) {
          FS.trackingDelegate['willMovePath'](old_path, new_path);
        }
      } catch (e) {
        console.log(
          "FS.trackingDelegate['willMovePath']('" +
            old_path +
            "', '" +
            new_path +
            "') threw an exception: " +
            e.message,
        );
      }
      FS.hashRemoveNode(old_node);
      try {
        old_dir.node_ops.rename(old_node, new_dir, new_name);
      } catch (e) {
        throw e;
      } finally {
        FS.hashAddNode(old_node);
      }
      try {
        if (FS.trackingDelegate['onMovePath'])
          FS.trackingDelegate['onMovePath'](old_path, new_path);
      } catch (e) {
        console.log(
          "FS.trackingDelegate['onMovePath']('" +
            old_path +
            "', '" +
            new_path +
            "') threw an exception: " +
            e.message,
        );
      }
    },
    rmdir: function (path) {
      var lookup = FS.lookupPath(path, { parent: true });
      var parent = lookup.node;
      var name = PATH.basename(path);
      var node = FS.lookupNode(parent, name);
      var err = FS.mayDelete(parent, name, true);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.rmdir) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
      }
      try {
        if (FS.trackingDelegate['willDeletePath']) {
          FS.trackingDelegate['willDeletePath'](path);
        }
      } catch (e) {
        console.log(
          "FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message,
        );
      }
      parent.node_ops.rmdir(parent, name);
      FS.destroyNode(node);
      try {
        if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
      } catch (e) {
        console.log(
          "FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message,
        );
      }
    },
    readdir: function (path) {
      var lookup = FS.lookupPath(path, { follow: true });
      var node = lookup.node;
      if (!node.node_ops.readdir) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
      }
      return node.node_ops.readdir(node);
    },
    unlink: function (path) {
      var lookup = FS.lookupPath(path, { parent: true });
      var parent = lookup.node;
      var name = PATH.basename(path);
      var node = FS.lookupNode(parent, name);
      var err = FS.mayDelete(parent, name, false);
      if (err) {
        throw new FS.ErrnoError(err);
      }
      if (!parent.node_ops.unlink) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
      }
      try {
        if (FS.trackingDelegate['willDeletePath']) {
          FS.trackingDelegate['willDeletePath'](path);
        }
      } catch (e) {
        console.log(
          "FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message,
        );
      }
      parent.node_ops.unlink(parent, name);
      FS.destroyNode(node);
      try {
        if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
      } catch (e) {
        console.log(
          "FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message,
        );
      }
    },
    readlink: function (path) {
      var lookup = FS.lookupPath(path);
      var link = lookup.node;
      if (!link) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      }
      if (!link.node_ops.readlink) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
    },
    stat: function (path, dontFollow) {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      var node = lookup.node;
      if (!node) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      }
      if (!node.node_ops.getattr) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      return node.node_ops.getattr(node);
    },
    lstat: function (path) {
      return FS.stat(path, true);
    },
    chmod: function (path, mode, dontFollow) {
      var node;
      if (typeof path === 'string') {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      node.node_ops.setattr(node, {
        mode: (mode & 4095) | (node.mode & ~4095),
        timestamp: Date.now(),
      });
    },
    lchmod: function (path, mode) {
      FS.chmod(path, mode, true);
    },
    fchmod: function (fd, mode) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      }
      FS.chmod(stream.node, mode);
    },
    chown: function (path, uid, gid, dontFollow) {
      var node;
      if (typeof path === 'string') {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      node.node_ops.setattr(node, { timestamp: Date.now() });
    },
    lchown: function (path, uid, gid) {
      FS.chown(path, uid, gid, true);
    },
    fchown: function (fd, uid, gid) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      }
      FS.chown(stream.node, uid, gid);
    },
    truncate: function (path, len) {
      if (len < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var node;
      if (typeof path === 'string') {
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
      } else {
        node = path;
      }
      if (!node.node_ops.setattr) {
        throw new FS.ErrnoError(ERRNO_CODES.EPERM);
      }
      if (FS.isDir(node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
      }
      if (!FS.isFile(node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var err = FS.nodePermissions(node, 'w');
      if (err) {
        throw new FS.ErrnoError(err);
      }
      node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
    },
    ftruncate: function (fd, len) {
      var stream = FS.getStream(fd);
      if (!stream) {
        throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      }
      if ((stream.flags & 2097155) === 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      FS.truncate(stream.node, len);
    },
    utime: function (path, atime, mtime) {
      var lookup = FS.lookupPath(path, { follow: true });
      var node = lookup.node;
      node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
    },
    open: function (path, flags, mode, fd_start, fd_end) {
      if (path === '') {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      }
      flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
      mode = typeof mode === 'undefined' ? 438 : mode;
      if (flags & 64) {
        mode = (mode & 4095) | 32768;
      } else {
        mode = 0;
      }
      var node;
      if (typeof path === 'object') {
        node = path;
      } else {
        path = PATH.normalize(path);
        try {
          var lookup = FS.lookupPath(path, { follow: !(flags & 131072) });
          node = lookup.node;
        } catch (e) {}
      }
      var created = false;
      if (flags & 64) {
        if (node) {
          if (flags & 128) {
            throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
          }
        } else {
          node = FS.mknod(path, mode, 0);
          created = true;
        }
      }
      if (!node) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      }
      if (FS.isChrdev(node.mode)) {
        flags &= ~512;
      }
      if (flags & 65536 && !FS.isDir(node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
      }
      if (!created) {
        var err = FS.mayOpen(node, flags);
        if (err) {
          throw new FS.ErrnoError(err);
        }
      }
      if (flags & 512) {
        FS.truncate(node, 0);
      }
      flags &= ~(128 | 512);
      var stream = FS.createStream(
        {
          node: node,
          path: FS.getPath(node),
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          ungotten: [],
          error: false,
        },
        fd_start,
        fd_end,
      );
      if (stream.stream_ops.open) {
        stream.stream_ops.open(stream);
      }
      if (Module['logReadFiles'] && !(flags & 1)) {
        if (!FS.readFiles) FS.readFiles = {};
        if (!(path in FS.readFiles)) {
          FS.readFiles[path] = 1;
          Module['printErr']('read file: ' + path);
        }
      }
      try {
        if (FS.trackingDelegate['onOpenFile']) {
          var trackingFlags = 0;
          if ((flags & 2097155) !== 1) {
            trackingFlags |= FS.tracking.openFlags.READ;
          }
          if ((flags & 2097155) !== 0) {
            trackingFlags |= FS.tracking.openFlags.WRITE;
          }
          FS.trackingDelegate['onOpenFile'](path, trackingFlags);
        }
      } catch (e) {
        console.log(
          "FS.trackingDelegate['onOpenFile']('" +
            path +
            "', flags) threw an exception: " +
            e.message,
        );
      }
      return stream;
    },
    close: function (stream) {
      if (stream.getdents) stream.getdents = null;
      try {
        if (stream.stream_ops.close) {
          stream.stream_ops.close(stream);
        }
      } catch (e) {
        throw e;
      } finally {
        FS.closeStream(stream.fd);
      }
    },
    llseek: function (stream, offset, whence) {
      if (!stream.seekable || !stream.stream_ops.llseek) {
        throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
      }
      stream.position = stream.stream_ops.llseek(stream, offset, whence);
      stream.ungotten = [];
      return stream.position;
    },
    read: function (stream, buffer, offset, length, position) {
      if (length < 0 || position < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      if ((stream.flags & 2097155) === 1) {
        throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      }
      if (FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
      }
      if (!stream.stream_ops.read) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      var seeking = true;
      if (typeof position === 'undefined') {
        position = stream.position;
        seeking = false;
      } else if (!stream.seekable) {
        throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
      }
      var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
      if (!seeking) stream.position += bytesRead;
      return bytesRead;
    },
    write: function (stream, buffer, offset, length, position, canOwn) {
      if (length < 0 || position < 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      if ((stream.flags & 2097155) === 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      }
      if (FS.isDir(stream.node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
      }
      if (!stream.stream_ops.write) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      if (stream.flags & 1024) {
        FS.llseek(stream, 0, 2);
      }
      var seeking = true;
      if (typeof position === 'undefined') {
        position = stream.position;
        seeking = false;
      } else if (!stream.seekable) {
        throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
      }
      var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
      if (!seeking) stream.position += bytesWritten;
      try {
        if (stream.path && FS.trackingDelegate['onWriteToFile'])
          FS.trackingDelegate['onWriteToFile'](stream.path);
      } catch (e) {
        console.log(
          "FS.trackingDelegate['onWriteToFile']('" + path + "') threw an exception: " + e.message,
        );
      }
      return bytesWritten;
    },
    allocate: function (stream, offset, length) {
      if (offset < 0 || length <= 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
      }
      if ((stream.flags & 2097155) === 0) {
        throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      }
      if (!FS.isFile(stream.node.mode) && !FS.isDir(node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
      }
      if (!stream.stream_ops.allocate) {
        throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
      }
      stream.stream_ops.allocate(stream, offset, length);
    },
    mmap: function (stream, buffer, offset, length, position, prot, flags) {
      if ((stream.flags & 2097155) === 1) {
        throw new FS.ErrnoError(ERRNO_CODES.EACCES);
      }
      if (!stream.stream_ops.mmap) {
        throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
      }
      return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
    },
    msync: function (stream, buffer, offset, length, mmapFlags) {
      if (!stream || !stream.stream_ops.msync) {
        return 0;
      }
      return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
    },
    munmap: function (stream) {
      return 0;
    },
    ioctl: function (stream, cmd, arg) {
      if (!stream.stream_ops.ioctl) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
      }
      return stream.stream_ops.ioctl(stream, cmd, arg);
    },
    readFile: function (path, opts) {
      opts = opts || {};
      opts.flags = opts.flags || 'r';
      opts.encoding = opts.encoding || 'binary';
      if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
        throw new Error('Invalid encoding type "' + opts.encoding + '"');
      }
      var ret;
      var stream = FS.open(path, opts.flags);
      var stat = FS.stat(path);
      var length = stat.size;
      var buf = new Uint8Array(length);
      FS.read(stream, buf, 0, length, 0);
      if (opts.encoding === 'utf8') {
        ret = UTF8ArrayToString(buf, 0);
      } else if (opts.encoding === 'binary') {
        ret = buf;
      }
      FS.close(stream);
      return ret;
    },
    writeFile: function (path, data, opts) {
      opts = opts || {};
      opts.flags = opts.flags || 'w';
      opts.encoding = opts.encoding || 'utf8';
      if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
        throw new Error('Invalid encoding type "' + opts.encoding + '"');
      }
      var stream = FS.open(path, opts.flags, opts.mode);
      if (opts.encoding === 'utf8') {
        var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
        var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
        FS.write(stream, buf, 0, actualNumBytes, 0, opts.canOwn);
      } else if (opts.encoding === 'binary') {
        FS.write(stream, data, 0, data.length, 0, opts.canOwn);
      }
      FS.close(stream);
    },
    cwd: function () {
      return FS.currentPath;
    },
    chdir: function (path) {
      var lookup = FS.lookupPath(path, { follow: true });
      if (lookup.node === null) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
      }
      if (!FS.isDir(lookup.node.mode)) {
        throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
      }
      var err = FS.nodePermissions(lookup.node, 'x');
      if (err) {
        throw new FS.ErrnoError(err);
      }
      FS.currentPath = lookup.path;
    },
    createDefaultDirectories: function () {
      FS.mkdir('/tmp');
      FS.mkdir('/home');
      FS.mkdir('/home/web_user');
    },
    createDefaultDevices: function () {
      FS.mkdir('/dev');
      FS.registerDevice(FS.makedev(1, 3), {
        read: function () {
          return 0;
        },
        write: function (stream, buffer, offset, length, pos) {
          return length;
        },
      });
      FS.mkdev('/dev/null', FS.makedev(1, 3));
      TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
      TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
      FS.mkdev('/dev/tty', FS.makedev(5, 0));
      FS.mkdev('/dev/tty1', FS.makedev(6, 0));
      var random_device;
      if (typeof crypto !== 'undefined') {
        var randomBuffer = new Uint8Array(1);
        random_device = function () {
          crypto.getRandomValues(randomBuffer);
          return randomBuffer[0];
        };
      } else if (ENVIRONMENT_IS_NODE) {
        random_device = function () {
          return require('crypto').randomBytes(1)[0];
        };
      } else {
        random_device = function () {
          return (Math.random() * 256) | 0;
        };
      }
      FS.createDevice('/dev', 'random', random_device);
      FS.createDevice('/dev', 'urandom', random_device);
      FS.mkdir('/dev/shm');
      FS.mkdir('/dev/shm/tmp');
    },
    createSpecialDirectories: function () {
      FS.mkdir('/proc');
      FS.mkdir('/proc/self');
      FS.mkdir('/proc/self/fd');
      FS.mount(
        {
          mount: function () {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511, 73);
            node.node_ops = {
              lookup: function (parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: {
                    readlink: function () {
                      return stream.path;
                    },
                  },
                };
                ret.parent = ret;
                return ret;
              },
            };
            return node;
          },
        },
        {},
        '/proc/self/fd',
      );
    },
    createStandardStreams: function () {
      if (Module['stdin']) {
        FS.createDevice('/dev', 'stdin', Module['stdin']);
      } else {
        FS.symlink('/dev/tty', '/dev/stdin');
      }
      if (Module['stdout']) {
        FS.createDevice('/dev', 'stdout', null, Module['stdout']);
      } else {
        FS.symlink('/dev/tty', '/dev/stdout');
      }
      if (Module['stderr']) {
        FS.createDevice('/dev', 'stderr', null, Module['stderr']);
      } else {
        FS.symlink('/dev/tty1', '/dev/stderr');
      }
      var stdin = FS.open('/dev/stdin', 'r');
      assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
      var stdout = FS.open('/dev/stdout', 'w');
      assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
      var stderr = FS.open('/dev/stderr', 'w');
      assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
    },
    ensureErrnoError: function () {
      if (FS.ErrnoError) return;
      FS.ErrnoError = function ErrnoError(errno, node) {
        this.node = node;
        this.setErrno = function (errno) {
          this.errno = errno;
          for (var key in ERRNO_CODES) {
            if (ERRNO_CODES[key] === errno) {
              this.code = key;
              break;
            }
          }
        };
        this.setErrno(errno);
        this.message = ERRNO_MESSAGES[errno];
      };
      FS.ErrnoError.prototype = new Error();
      FS.ErrnoError.prototype.constructor = FS.ErrnoError;
      [ERRNO_CODES.ENOENT].forEach(function (code) {
        FS.genericErrors[code] = new FS.ErrnoError(code);
        FS.genericErrors[code].stack = '<generic error, no stack>';
      });
    },
    staticInit: function () {
      FS.ensureErrnoError();
      FS.nameTable = new Array(4096);
      FS.mount(MEMFS, {}, '/');
      FS.createDefaultDirectories();
      FS.createDefaultDevices();
      FS.createSpecialDirectories();
      FS.filesystems = { MEMFS: MEMFS, IDBFS: IDBFS, NODEFS: NODEFS, WORKERFS: WORKERFS };
    },
    init: function (input, output, error) {
      assert(
        !FS.init.initialized,
        'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)',
      );
      FS.init.initialized = true;
      FS.ensureErrnoError();
      Module['stdin'] = input || Module['stdin'];
      Module['stdout'] = output || Module['stdout'];
      Module['stderr'] = error || Module['stderr'];
      FS.createStandardStreams();
    },
    quit: function () {
      FS.init.initialized = false;
      var fflush = Module['_fflush'];
      if (fflush) fflush(0);
      for (var i = 0; i < FS.streams.length; i++) {
        var stream = FS.streams[i];
        if (!stream) {
          continue;
        }
        FS.close(stream);
      }
    },
    getMode: function (canRead, canWrite) {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    },
    joinPath: function (parts, forceRelative) {
      var path = PATH.join.apply(null, parts);
      if (forceRelative && path[0] == '/') path = path.substr(1);
      return path;
    },
    absolutePath: function (relative, base) {
      return PATH.resolve(base, relative);
    },
    standardizePath: function (path) {
      return PATH.normalize(path);
    },
    findObject: function (path, dontResolveLastLink) {
      var ret = FS.analyzePath(path, dontResolveLastLink);
      if (ret.exists) {
        return ret.object;
      } else {
        ___setErrNo(ret.error);
        return null;
      }
    },
    analyzePath: function (path, dontResolveLastLink) {
      try {
        var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
        path = lookup.path;
      } catch (e) {}
      var ret = {
        isRoot: false,
        exists: false,
        error: 0,
        name: null,
        path: null,
        object: null,
        parentExists: false,
        parentPath: null,
        parentObject: null,
      };
      try {
        var lookup = FS.lookupPath(path, { parent: true });
        ret.parentExists = true;
        ret.parentPath = lookup.path;
        ret.parentObject = lookup.node;
        ret.name = PATH.basename(path);
        lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
        ret.exists = true;
        ret.path = lookup.path;
        ret.object = lookup.node;
        ret.name = lookup.node.name;
        ret.isRoot = lookup.path === '/';
      } catch (e) {
        ret.error = e.errno;
      }
      return ret;
    },
    createFolder: function (parent, name, canRead, canWrite) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      var mode = FS.getMode(canRead, canWrite);
      return FS.mkdir(path, mode);
    },
    createPath: function (parent, path, canRead, canWrite) {
      parent = typeof parent === 'string' ? parent : FS.getPath(parent);
      var parts = path.split('/').reverse();
      while (parts.length) {
        var part = parts.pop();
        if (!part) continue;
        var current = PATH.join2(parent, part);
        try {
          FS.mkdir(current);
        } catch (e) {}
        parent = current;
      }
      return current;
    },
    createFile: function (parent, name, properties, canRead, canWrite) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      var mode = FS.getMode(canRead, canWrite);
      return FS.create(path, mode);
    },
    createDataFile: function (parent, name, data, canRead, canWrite, canOwn) {
      var path = name
        ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name)
        : parent;
      var mode = FS.getMode(canRead, canWrite);
      var node = FS.create(path, mode);
      if (data) {
        if (typeof data === 'string') {
          var arr = new Array(data.length);
          for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
          data = arr;
        }
        FS.chmod(node, mode | 146);
        var stream = FS.open(node, 'w');
        FS.write(stream, data, 0, data.length, 0, canOwn);
        FS.close(stream);
        FS.chmod(node, mode);
      }
      return node;
    },
    createDevice: function (parent, name, input, output) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      var mode = FS.getMode(!!input, !!output);
      if (!FS.createDevice.major) FS.createDevice.major = 64;
      var dev = FS.makedev(FS.createDevice.major++, 0);
      FS.registerDevice(dev, {
        open: function (stream) {
          stream.seekable = false;
        },
        close: function (stream) {
          if (output && output.buffer && output.buffer.length) {
            output(10);
          }
        },
        read: function (stream, buffer, offset, length, pos) {
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = input();
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset + i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },
        write: function (stream, buffer, offset, length, pos) {
          for (var i = 0; i < length; i++) {
            try {
              output(buffer[offset + i]);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        },
      });
      return FS.mkdev(path, mode, dev);
    },
    createLink: function (parent, name, target, canRead, canWrite) {
      var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
      return FS.symlink(target, path);
    },
    forceLoadFile: function (obj) {
      if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
      var success = true;
      if (typeof XMLHttpRequest !== 'undefined') {
        throw new Error(
          'Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.',
        );
      } else if (Module['read']) {
        try {
          obj.contents = intArrayFromString(Module['read'](obj.url), true);
          obj.usedBytes = obj.contents.length;
        } catch (e) {
          success = false;
        }
      } else {
        throw new Error('Cannot load without read() or XMLHttpRequest.');
      }
      if (!success) ___setErrNo(ERRNO_CODES.EIO);
      return success;
    },
    createLazyFile: function (parent, name, url, canRead, canWrite) {
      function LazyUint8Array() {
        this.lengthKnown = false;
        this.chunks = [];
      }
      LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
        if (idx > this.length - 1 || idx < 0) {
          return undefined;
        }
        var chunkOffset = idx % this.chunkSize;
        var chunkNum = (idx / this.chunkSize) | 0;
        return this.getter(chunkNum)[chunkOffset];
      };
      LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
        this.getter = getter;
      };
      LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
        var xhr = new XMLHttpRequest();
        xhr.open('HEAD', url, false);
        xhr.send(null);
        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
          throw new Error("Couldn't load " + url + '. Status: ' + xhr.status);
        var datalength = Number(xhr.getResponseHeader('Content-length'));
        var header;
        var hasByteServing =
          (header = xhr.getResponseHeader('Accept-Ranges')) && header === 'bytes';
        var usesGzip = (header = xhr.getResponseHeader('Content-Encoding')) && header === 'gzip';
        var chunkSize = 1024 * 1024;
        if (!hasByteServing) chunkSize = datalength;
        var doXHR = function (from, to) {
          if (from > to)
            throw new Error('invalid range (' + from + ', ' + to + ') or no bytes requested!');
          if (to > datalength - 1)
            throw new Error('only ' + datalength + ' bytes available! programmer error!');
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, false);
          if (datalength !== chunkSize) xhr.setRequestHeader('Range', 'bytes=' + from + '-' + to);
          if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
          if (xhr.overrideMimeType) {
            xhr.overrideMimeType('text/plain; charset=x-user-defined');
          }
          xhr.send(null);
          if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
            throw new Error("Couldn't load " + url + '. Status: ' + xhr.status);
          if (xhr.response !== undefined) {
            return new Uint8Array(xhr.response || []);
          } else {
            return intArrayFromString(xhr.responseText || '', true);
          }
        };
        var lazyArray = this;
        lazyArray.setDataGetter(function (chunkNum) {
          var start = chunkNum * chunkSize;
          var end = (chunkNum + 1) * chunkSize - 1;
          end = Math.min(end, datalength - 1);
          if (typeof lazyArray.chunks[chunkNum] === 'undefined') {
            lazyArray.chunks[chunkNum] = doXHR(start, end);
          }
          if (typeof lazyArray.chunks[chunkNum] === 'undefined') throw new Error('doXHR failed!');
          return lazyArray.chunks[chunkNum];
        });
        if (usesGzip || !datalength) {
          chunkSize = datalength = 1;
          datalength = this.getter(0).length;
          chunkSize = datalength;
          console.log(
            'LazyFiles on gzip forces download of the whole file when length is accessed',
          );
        }
        this._length = datalength;
        this._chunkSize = chunkSize;
        this.lengthKnown = true;
      };
      if (typeof XMLHttpRequest !== 'undefined') {
        if (!ENVIRONMENT_IS_WORKER)
          throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
        var lazyArray = new LazyUint8Array();
        Object.defineProperties(lazyArray, {
          length: {
            get: function () {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._length;
            },
          },
          chunkSize: {
            get: function () {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._chunkSize;
            },
          },
        });
        var properties = { isDevice: false, contents: lazyArray };
      } else {
        var properties = { isDevice: false, url: url };
      }
      var node = FS.createFile(parent, name, properties, canRead, canWrite);
      if (properties.contents) {
        node.contents = properties.contents;
      } else if (properties.url) {
        node.contents = null;
        node.url = properties.url;
      }
      Object.defineProperties(node, {
        usedBytes: {
          get: function () {
            return this.contents.length;
          },
        },
      });
      var stream_ops = {};
      var keys = Object.keys(node.stream_ops);
      keys.forEach(function (key) {
        var fn = node.stream_ops[key];
        stream_ops[key] = function forceLoadLazyFile() {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          return fn.apply(null, arguments);
        };
      });
      stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
        if (!FS.forceLoadFile(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        }
        var contents = stream.node.contents;
        if (position >= contents.length) return 0;
        var size = Math.min(contents.length - position, length);
        assert(size >= 0);
        if (contents.slice) {
          for (var i = 0; i < size; i++) {
            buffer[offset + i] = contents[position + i];
          }
        } else {
          for (var i = 0; i < size; i++) {
            buffer[offset + i] = contents.get(position + i);
          }
        }
        return size;
      };
      node.stream_ops = stream_ops;
      return node;
    },
    createPreloadedFile: function (
      parent,
      name,
      url,
      canRead,
      canWrite,
      onload,
      onerror,
      dontCreateFile,
      canOwn,
      preFinish,
    ) {
      Browser.init();
      var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency('cp ' + fullname);
      function processData(byteArray) {
        function finish(byteArray) {
          if (preFinish) preFinish();
          if (!dontCreateFile) {
            FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
          }
          if (onload) onload();
          removeRunDependency(dep);
        }
        var handled = false;
        Module['preloadPlugins'].forEach(function (plugin) {
          if (handled) return;
          if (plugin['canHandle'](fullname)) {
            plugin['handle'](byteArray, fullname, finish, function () {
              if (onerror) onerror();
              removeRunDependency(dep);
            });
            handled = true;
          }
        });
        if (!handled) finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == 'string') {
        Browser.asyncLoad(
          url,
          function (byteArray) {
            processData(byteArray);
          },
          onerror,
        );
      } else {
        processData(url);
      }
    },
    indexedDB: function () {
      return (
        window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB
      );
    },
    DB_NAME: function () {
      return 'EM_FS_' + window.location.pathname;
    },
    DB_VERSION: 20,
    DB_STORE_NAME: 'FILE_DATA',
    saveFilesToDB: function (paths, onload, onerror) {
      onload = onload || function () {};
      onerror = onerror || function () {};
      var indexedDB = FS.indexedDB();
      try {
        var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
      } catch (e) {
        return onerror(e);
      }
      openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
        console.log('creating db');
        var db = openRequest.result;
        db.createObjectStore(FS.DB_STORE_NAME);
      };
      openRequest.onsuccess = function openRequest_onsuccess() {
        var db = openRequest.result;
        var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
        var files = transaction.objectStore(FS.DB_STORE_NAME);
        var ok = 0,
          fail = 0,
          total = paths.length;
        function finish() {
          if (fail == 0) onload();
          else onerror();
        }
        paths.forEach(function (path) {
          var putRequest = files.put(FS.analyzePath(path).object.contents, path);
          putRequest.onsuccess = function putRequest_onsuccess() {
            ok++;
            if (ok + fail == total) finish();
          };
          putRequest.onerror = function putRequest_onerror() {
            fail++;
            if (ok + fail == total) finish();
          };
        });
        transaction.onerror = onerror;
      };
      openRequest.onerror = onerror;
    },
    loadFilesFromDB: function (paths, onload, onerror) {
      onload = onload || function () {};
      onerror = onerror || function () {};
      var indexedDB = FS.indexedDB();
      try {
        var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
      } catch (e) {
        return onerror(e);
      }
      openRequest.onupgradeneeded = onerror;
      openRequest.onsuccess = function openRequest_onsuccess() {
        var db = openRequest.result;
        try {
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
        } catch (e) {
          onerror(e);
          return;
        }
        var files = transaction.objectStore(FS.DB_STORE_NAME);
        var ok = 0,
          fail = 0,
          total = paths.length;
        function finish() {
          if (fail == 0) onload();
          else onerror();
        }
        paths.forEach(function (path) {
          var getRequest = files.get(path);
          getRequest.onsuccess = function getRequest_onsuccess() {
            if (FS.analyzePath(path).exists) {
              FS.unlink(path);
            }
            FS.createDataFile(
              PATH.dirname(path),
              PATH.basename(path),
              getRequest.result,
              true,
              true,
              true,
            );
            ok++;
            if (ok + fail == total) finish();
          };
          getRequest.onerror = function getRequest_onerror() {
            fail++;
            if (ok + fail == total) finish();
          };
        });
        transaction.onerror = onerror;
      };
      openRequest.onerror = onerror;
    },
  };
  var SYSCALLS = {
    DEFAULT_POLLMASK: 5,
    mappings: {},
    umask: 511,
    calculateAt: function (dirfd, path) {
      if (path[0] !== '/') {
        var dir;
        if (dirfd === -100) {
          dir = FS.cwd();
        } else {
          var dirstream = FS.getStream(dirfd);
          if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
          dir = dirstream.path;
        }
        path = PATH.join2(dir, path);
      }
      return path;
    },
    doStat: function (func, path, buf) {
      try {
        var stat = func(path);
      } catch (e) {
        if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
          return -ERRNO_CODES.ENOTDIR;
        }
        throw e;
      }
      HEAP32[buf >> 2] = stat.dev;
      HEAP32[(buf + 4) >> 2] = 0;
      HEAP32[(buf + 8) >> 2] = stat.ino;
      HEAP32[(buf + 12) >> 2] = stat.mode;
      HEAP32[(buf + 16) >> 2] = stat.nlink;
      HEAP32[(buf + 20) >> 2] = stat.uid;
      HEAP32[(buf + 24) >> 2] = stat.gid;
      HEAP32[(buf + 28) >> 2] = stat.rdev;
      HEAP32[(buf + 32) >> 2] = 0;
      HEAP32[(buf + 36) >> 2] = stat.size;
      HEAP32[(buf + 40) >> 2] = 4096;
      HEAP32[(buf + 44) >> 2] = stat.blocks;
      HEAP32[(buf + 48) >> 2] = (stat.atime.getTime() / 1e3) | 0;
      HEAP32[(buf + 52) >> 2] = 0;
      HEAP32[(buf + 56) >> 2] = (stat.mtime.getTime() / 1e3) | 0;
      HEAP32[(buf + 60) >> 2] = 0;
      HEAP32[(buf + 64) >> 2] = (stat.ctime.getTime() / 1e3) | 0;
      HEAP32[(buf + 68) >> 2] = 0;
      HEAP32[(buf + 72) >> 2] = stat.ino;
      return 0;
    },
    doMsync: function (addr, stream, len, flags) {
      var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
      FS.msync(stream, buffer, 0, len, flags);
    },
    doMkdir: function (path, mode) {
      path = PATH.normalize(path);
      if (path[path.length - 1] === '/') path = path.substr(0, path.length - 1);
      FS.mkdir(path, mode, 0);
      return 0;
    },
    doMknod: function (path, mode, dev) {
      switch (mode & 61440) {
        case 32768:
        case 8192:
        case 24576:
        case 4096:
        case 49152:
          break;
        default:
          return -ERRNO_CODES.EINVAL;
      }
      FS.mknod(path, mode, dev);
      return 0;
    },
    doReadlink: function (path, buf, bufsize) {
      if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
      var ret = FS.readlink(path);
      var len = Math.min(bufsize, lengthBytesUTF8(ret));
      var endChar = HEAP8[buf + len];
      stringToUTF8(ret, buf, bufsize + 1);
      HEAP8[buf + len] = endChar;
      return len;
    },
    doAccess: function (path, amode) {
      if (amode & ~7) {
        return -ERRNO_CODES.EINVAL;
      }
      var node;
      var lookup = FS.lookupPath(path, { follow: true });
      node = lookup.node;
      var perms = '';
      if (amode & 4) perms += 'r';
      if (amode & 2) perms += 'w';
      if (amode & 1) perms += 'x';
      if (perms && FS.nodePermissions(node, perms)) {
        return -ERRNO_CODES.EACCES;
      }
      return 0;
    },
    doDup: function (path, flags, suggestFD) {
      var suggest = FS.getStream(suggestFD);
      if (suggest) FS.close(suggest);
      return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
    },
    doReadv: function (stream, iov, iovcnt, offset) {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(iov + i * 8) >> 2];
        var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
        var curr = FS.read(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break;
      }
      return ret;
    },
    doWritev: function (stream, iov, iovcnt, offset) {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(iov + i * 8) >> 2];
        var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
        var curr = FS.write(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
      }
      return ret;
    },
    varargs: 0,
    get: function (varargs) {
      SYSCALLS.varargs += 4;
      var ret = HEAP32[(SYSCALLS.varargs - 4) >> 2];
      return ret;
    },
    getStr: function () {
      var ret = Pointer_stringify(SYSCALLS.get());
      return ret;
    },
    getStreamFromFD: function () {
      var stream = FS.getStream(SYSCALLS.get());
      if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      return stream;
    },
    getSocketFromFD: function () {
      var socket = SOCKFS.getSocket(SYSCALLS.get());
      if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
      return socket;
    },
    getSocketAddress: function (allowNull) {
      var addrp = SYSCALLS.get(),
        addrlen = SYSCALLS.get();
      if (allowNull && addrp === 0) return null;
      var info = __read_sockaddr(addrp, addrlen);
      if (info.errno) throw new FS.ErrnoError(info.errno);
      info.addr = DNS.lookup_addr(info.addr) || info.addr;
      return info;
    },
    get64: function () {
      var low = SYSCALLS.get(),
        high = SYSCALLS.get();
      if (low >= 0) assert(high === 0);
      else assert(high === -1);
      return low;
    },
    getZero: function () {
      assert(SYSCALLS.get() === 0);
    },
  };
  function ___syscall195(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        buf = SYSCALLS.get();
      return SYSCALLS.doStat(FS.stat, path, buf);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall194(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var fd = SYSCALLS.get(),
        zero = SYSCALLS.getZero(),
        length = SYSCALLS.get64();
      FS.ftruncate(fd, length);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall197(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        buf = SYSCALLS.get();
      return SYSCALLS.doStat(FS.stat, stream.path, buf);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall196(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        buf = SYSCALLS.get();
      return SYSCALLS.doStat(FS.lstat, path, buf);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall202(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall199() {
    return ___syscall202.apply(null, arguments);
  }
  function _mktime(tmPtr) {
    _tzset();
    var date = new Date(
      HEAP32[(tmPtr + 20) >> 2] + 1900,
      HEAP32[(tmPtr + 16) >> 2],
      HEAP32[(tmPtr + 12) >> 2],
      HEAP32[(tmPtr + 8) >> 2],
      HEAP32[(tmPtr + 4) >> 2],
      HEAP32[tmPtr >> 2],
      0,
    );
    var dst = HEAP32[(tmPtr + 32) >> 2];
    var guessedOffset = date.getTimezoneOffset();
    var start = new Date(date.getFullYear(), 0, 1);
    var summerOffset = new Date(2e3, 6, 1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dstOffset = Math.min(winterOffset, summerOffset);
    if (dst < 0) {
      HEAP32[(tmPtr + 32) >> 2] = Number(dstOffset == guessedOffset);
    } else if (dst > 0 != (dstOffset == guessedOffset)) {
      var nonDstOffset = Math.max(winterOffset, summerOffset);
      var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
      date.setTime(date.getTime() + (trueOffset - guessedOffset) * 6e4);
    }
    HEAP32[(tmPtr + 24) >> 2] = date.getDay();
    var yday = ((date.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)) | 0;
    HEAP32[(tmPtr + 28) >> 2] = yday;
    return (date.getTime() / 1e3) | 0;
  }
  function ___syscall91(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var addr = SYSCALLS.get(),
        len = SYSCALLS.get();
      var info = SYSCALLS.mappings[addr];
      if (!info) return 0;
      if (len === info.len) {
        var stream = FS.getStream(info.fd);
        SYSCALLS.doMsync(addr, stream, len, info.flags);
        FS.munmap(stream);
        SYSCALLS.mappings[addr] = null;
        if (info.allocated) {
          _free(info.malloc);
        }
      }
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall212(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        owner = SYSCALLS.get(),
        group = SYSCALLS.get();
      FS.chown(path, owner, group);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall54(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        op = SYSCALLS.get();
      switch (op) {
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21506: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[argp >> 2] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL;
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        default:
          abort('bad ioctl syscall ' + op);
      }
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function _fork() {
    ___setErrNo(ERRNO_CODES.EAGAIN);
    return -1;
  }
  function ___syscall39(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        mode = SYSCALLS.get();
      return SYSCALLS.doMkdir(path, mode);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall38(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var old_path = SYSCALLS.getStr(),
        new_path = SYSCALLS.getStr();
      FS.rename(old_path, new_path);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function _getpwnam() {
    throw 'getpwnam: TODO';
  }
  function ___syscall33(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        amode = SYSCALLS.get();
      return SYSCALLS.doAccess(path, amode);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  var GAI_ERRNO_MESSAGES = {};
  function _gai_strerror(val) {
    var buflen = 256;
    if (!_gai_strerror.buffer) {
      _gai_strerror.buffer = _malloc(buflen);
      GAI_ERRNO_MESSAGES['0'] = 'Success';
      GAI_ERRNO_MESSAGES['' + -1] = "Invalid value for 'ai_flags' field";
      GAI_ERRNO_MESSAGES['' + -2] = 'NAME or SERVICE is unknown';
      GAI_ERRNO_MESSAGES['' + -3] = 'Temporary failure in name resolution';
      GAI_ERRNO_MESSAGES['' + -4] = 'Non-recoverable failure in name res';
      GAI_ERRNO_MESSAGES['' + -6] = "'ai_family' not supported";
      GAI_ERRNO_MESSAGES['' + -7] = "'ai_socktype' not supported";
      GAI_ERRNO_MESSAGES['' + -8] = "SERVICE not supported for 'ai_socktype'";
      GAI_ERRNO_MESSAGES['' + -10] = 'Memory allocation failure';
      GAI_ERRNO_MESSAGES['' + -11] = "System error returned in 'errno'";
      GAI_ERRNO_MESSAGES['' + -12] = 'Argument buffer overflow';
    }
    var msg = 'Unknown error';
    if (val in GAI_ERRNO_MESSAGES) {
      if (GAI_ERRNO_MESSAGES[val].length > buflen - 1) {
        msg = 'Message too long';
      } else {
        msg = GAI_ERRNO_MESSAGES[val];
      }
    }
    writeAsciiToMemory(msg, _gai_strerror.buffer);
    return _gai_strerror.buffer;
  }
  function _execl() {
    ___setErrNo(ERRNO_CODES.ENOEXEC);
    return -1;
  }
  function _execvp() {
    return _execl.apply(null, arguments);
  }
  var _environ = STATICTOP;
  STATICTOP += 16;
  function ___buildEnvironment(env) {
    var MAX_ENV_VALUES = 64;
    var TOTAL_ENV_SIZE = 1024;
    var poolPtr;
    var envPtr;
    if (!___buildEnvironment.called) {
      ___buildEnvironment.called = true;
      ENV['USER'] = ENV['LOGNAME'] = 'web_user';
      ENV['PATH'] = '/';
      ENV['PWD'] = '/';
      ENV['HOME'] = '/home/web_user';
      ENV['LANG'] = 'C';
      ENV['_'] = Module['thisProgram'];
      poolPtr = allocate(TOTAL_ENV_SIZE, 'i8', ALLOC_STATIC);
      envPtr = allocate(MAX_ENV_VALUES * 4, 'i8*', ALLOC_STATIC);
      HEAP32[envPtr >> 2] = poolPtr;
      HEAP32[_environ >> 2] = envPtr;
    } else {
      envPtr = HEAP32[_environ >> 2];
      poolPtr = HEAP32[envPtr >> 2];
    }
    var strings = [];
    var totalSize = 0;
    for (var key in env) {
      if (typeof env[key] === 'string') {
        var line = key + '=' + env[key];
        strings.push(line);
        totalSize += line.length;
      }
    }
    if (totalSize > TOTAL_ENV_SIZE) {
      throw new Error('Environment size exceeded TOTAL_ENV_SIZE!');
    }
    var ptrSize = 4;
    for (var i = 0; i < strings.length; i++) {
      var line = strings[i];
      writeAsciiToMemory(line, poolPtr);
      HEAP32[(envPtr + i * ptrSize) >> 2] = poolPtr;
      poolPtr += line.length + 1;
    }
    HEAP32[(envPtr + strings.length * ptrSize) >> 2] = 0;
  }
  var ENV = {};
  function _getenv(name) {
    if (name === 0) return 0;
    name = Pointer_stringify(name);
    if (!ENV.hasOwnProperty(name)) return 0;
    if (_getenv.ret) _free(_getenv.ret);
    _getenv.ret = allocate(intArrayFromString(ENV[name]), 'i8', ALLOC_NORMAL);
    return _getenv.ret;
  }
  function _gettimeofday(ptr) {
    var now = Date.now();
    HEAP32[ptr >> 2] = (now / 1e3) | 0;
    HEAP32[(ptr + 4) >> 2] = ((now % 1e3) * 1e3) | 0;
    return 0;
  }
  function ___map_file(pathname, size) {
    ___setErrNo(ERRNO_CODES.EPERM);
    return -1;
  }
  function _getgrgid() {
    Module['printErr']('missing function: getgrgid');
    abort(-1);
  }
  function _wait(stat_loc) {
    ___setErrNo(ERRNO_CODES.ECHILD);
    return -1;
  }
  function _waitpid() {
    return _wait.apply(null, arguments);
  }
  function __exit(status) {
    Module['exit'](status);
  }
  function _exit(status) {
    __exit(status);
  }
  function __Exit(status) {
    __exit(status);
  }
  function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
    return dest;
  }
  Module['_memcpy'] = _memcpy;
  function _utime(path, times) {
    var time;
    if (times) {
      var offset = 4;
      time = HEAP32[(times + offset) >> 2];
      time *= 1e3;
    } else {
      time = Date.now();
    }
    path = Pointer_stringify(path);
    try {
      FS.utime(path, time, time);
      return 0;
    } catch (e) {
      FS.handleFSError(e);
      return -1;
    }
  }
  function ___syscall10(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr();
      FS.unlink(path);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  var _llvm_pow_f64 = Math_pow;
  Module['_sbrk'] = _sbrk;
  Module['_memmove'] = _memmove;
  function ___syscall83(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var target = SYSCALLS.getStr(),
        linkpath = SYSCALLS.getStr();
      FS.symlink(target, linkpath);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  var __sigalrm_handler = 0;
  function _signal(sig, func) {
    if (sig == 14) {
      __sigalrm_handler = func;
    } else {
    }
    return 0;
  }
  function ___syscall85(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        buf = SYSCALLS.get(),
        bufsize = SYSCALLS.get();
      return SYSCALLS.doReadlink(path, buf, bufsize);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall122(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var buf = SYSCALLS.get();
      if (!buf) return -ERRNO_CODES.EFAULT;
      var layout = {
        sysname: 0,
        nodename: 65,
        domainname: 325,
        machine: 260,
        version: 195,
        release: 130,
        __size__: 390,
      };
      function copyString(element, value) {
        var offset = layout[element];
        writeAsciiToMemory(value, buf + offset);
      }
      copyString('sysname', 'Emscripten');
      copyString('nodename', 'emscripten');
      copyString('release', '1.0');
      copyString('version', '#1');
      copyString('machine', 'x86-JS');
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall201() {
    return ___syscall202.apply(null, arguments);
  }
  function ___syscall183(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var buf = SYSCALLS.get(),
        size = SYSCALLS.get();
      if (size === 0) return -ERRNO_CODES.EINVAL;
      var cwd = FS.cwd();
      if (size < cwd.length + 1) return -ERRNO_CODES.ERANGE;
      writeAsciiToMemory(cwd, buf);
      return buf;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function _getpwuid(uid) {
    return 0;
  }
  function ___syscall51(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      return -ERRNO_CODES.ENOSYS;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall42() {
    return ___syscall51.apply(null, arguments);
  }
  function ___syscall40(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr();
      FS.rmdir(path);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  var ___tm_timezone = allocate(intArrayFromString('GMT'), 'i8', ALLOC_STATIC);
  function _gmtime_r(time, tmPtr) {
    var date = new Date(HEAP32[time >> 2] * 1e3);
    HEAP32[tmPtr >> 2] = date.getUTCSeconds();
    HEAP32[(tmPtr + 4) >> 2] = date.getUTCMinutes();
    HEAP32[(tmPtr + 8) >> 2] = date.getUTCHours();
    HEAP32[(tmPtr + 12) >> 2] = date.getUTCDate();
    HEAP32[(tmPtr + 16) >> 2] = date.getUTCMonth();
    HEAP32[(tmPtr + 20) >> 2] = date.getUTCFullYear() - 1900;
    HEAP32[(tmPtr + 24) >> 2] = date.getUTCDay();
    HEAP32[(tmPtr + 36) >> 2] = 0;
    HEAP32[(tmPtr + 32) >> 2] = 0;
    var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    var yday = ((date.getTime() - start) / (1e3 * 60 * 60 * 24)) | 0;
    HEAP32[(tmPtr + 28) >> 2] = yday;
    HEAP32[(tmPtr + 40) >> 2] = ___tm_timezone;
    return tmPtr;
  }
  function ___syscall60(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var mask = SYSCALLS.get();
      var old = SYSCALLS.umask;
      SYSCALLS.umask = mask;
      return old;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall63(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var old = SYSCALLS.getStreamFromFD(),
        suggestFD = SYSCALLS.get();
      if (old.fd === suggestFD) return suggestFD;
      return SYSCALLS.doDup(old.path, old.flags, suggestFD);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  var PROCINFO = { ppid: 1, pid: 42, sid: 42, pgid: 42 };
  function ___syscall20(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      return PROCINFO.pid;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  Module['_memset'] = _memset;
  function _abort() {
    Module['abort']();
  }
  function ___lock() {}
  function ___unlock() {}
  Module['_llvm_bswap_i32'] = _llvm_bswap_i32;
  Module['_llvm_bswap_i16'] = _llvm_bswap_i16;
  function ___syscall15(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        mode = SYSCALLS.get();
      FS.chmod(path, mode);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall14(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr(),
        mode = SYSCALLS.get(),
        dev = SYSCALLS.get();
      return SYSCALLS.doMknod(path, mode, dev);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  var Browser = {
    mainLoop: {
      scheduler: null,
      method: '',
      currentlyRunningMainloop: 0,
      func: null,
      arg: 0,
      timingMode: 0,
      timingValue: 0,
      currentFrameNumber: 0,
      queue: [],
      pause: function () {
        Browser.mainLoop.scheduler = null;
        Browser.mainLoop.currentlyRunningMainloop++;
      },
      resume: function () {
        Browser.mainLoop.currentlyRunningMainloop++;
        var timingMode = Browser.mainLoop.timingMode;
        var timingValue = Browser.mainLoop.timingValue;
        var func = Browser.mainLoop.func;
        Browser.mainLoop.func = null;
        _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true);
        _emscripten_set_main_loop_timing(timingMode, timingValue);
        Browser.mainLoop.scheduler();
      },
      updateStatus: function () {
        if (Module['setStatus']) {
          var message = Module['statusMessage'] || 'Please wait...';
          var remaining = Browser.mainLoop.remainingBlockers;
          var expected = Browser.mainLoop.expectedBlockers;
          if (remaining) {
            if (remaining < expected) {
              Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
            } else {
              Module['setStatus'](message);
            }
          } else {
            Module['setStatus']('');
          }
        }
      },
      runIter: function (func) {
        if (ABORT) return;
        if (Module['preMainLoop']) {
          var preRet = Module['preMainLoop']();
          if (preRet === false) {
            return;
          }
        }
        try {
          func();
        } catch (e) {
          if (e instanceof ExitStatus) {
            return;
          } else {
            if (e && typeof e === 'object' && e.stack)
              Module.printErr('exception thrown: ' + [e, e.stack]);
            throw e;
          }
        }
        if (Module['postMainLoop']) Module['postMainLoop']();
      },
    },
    isFullscreen: false,
    pointerLock: false,
    moduleContextCreatedCallbacks: [],
    workers: [],
    init: function () {
      if (!Module['preloadPlugins']) Module['preloadPlugins'] = [];
      if (Browser.initted) return;
      Browser.initted = true;
      try {
        new Blob();
        Browser.hasBlobConstructor = true;
      } catch (e) {
        Browser.hasBlobConstructor = false;
        console.log('warning: no blob constructor, cannot create blobs with mimetypes');
      }
      Browser.BlobBuilder =
        typeof MozBlobBuilder != 'undefined'
          ? MozBlobBuilder
          : typeof WebKitBlobBuilder != 'undefined'
            ? WebKitBlobBuilder
            : !Browser.hasBlobConstructor
              ? console.log('warning: no BlobBuilder')
              : null;
      Browser.URLObject =
        typeof window != 'undefined' ? (window.URL ? window.URL : window.webkitURL) : undefined;
      if (!Module.noImageDecoding && typeof Browser.URLObject === 'undefined') {
        console.log(
          'warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.',
        );
        Module.noImageDecoding = true;
      }
      var imagePlugin = {};
      imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
        return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
      };
      imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
        var b = null;
        if (Browser.hasBlobConstructor) {
          try {
            b = new Blob([byteArray], { type: Browser.getMimetype(name) });
            if (b.size !== byteArray.length) {
              b = new Blob([new Uint8Array(byteArray).buffer], { type: Browser.getMimetype(name) });
            }
          } catch (e) {
            Runtime.warnOnce(
              'Blob constructor present but fails: ' + e + '; falling back to blob builder',
            );
          }
        }
        if (!b) {
          var bb = new Browser.BlobBuilder();
          bb.append(new Uint8Array(byteArray).buffer);
          b = bb.getBlob();
        }
        var url = Browser.URLObject.createObjectURL(b);
        var img = new Image();
        img.onload = function img_onload() {
          assert(img.complete, 'Image ' + name + ' could not be decoded');
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          Module['preloadedImages'][name] = canvas;
          Browser.URLObject.revokeObjectURL(url);
          if (onload) onload(byteArray);
        };
        img.onerror = function img_onerror(event) {
          console.log('Image ' + url + ' could not be decoded');
          if (onerror) onerror();
        };
        img.src = url;
      };
      Module['preloadPlugins'].push(imagePlugin);
      var audioPlugin = {};
      audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
        return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
      };
      audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
        var done = false;
        function finish(audio) {
          if (done) return;
          done = true;
          Module['preloadedAudios'][name] = audio;
          if (onload) onload(byteArray);
        }
        function fail() {
          if (done) return;
          done = true;
          Module['preloadedAudios'][name] = new Audio();
          if (onerror) onerror();
        }
        if (Browser.hasBlobConstructor) {
          try {
            var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
          } catch (e) {
            return fail();
          }
          var url = Browser.URLObject.createObjectURL(b);
          var audio = new Audio();
          audio.addEventListener(
            'canplaythrough',
            function () {
              finish(audio);
            },
            false,
          );
          audio.onerror = function audio_onerror(event) {
            if (done) return;
            console.log(
              'warning: browser could not fully decode audio ' +
                name +
                ', trying slower base64 approach',
            );
            function encode64(data) {
              var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
              var PAD = '=';
              var ret = '';
              var leftchar = 0;
              var leftbits = 0;
              for (var i = 0; i < data.length; i++) {
                leftchar = (leftchar << 8) | data[i];
                leftbits += 8;
                while (leftbits >= 6) {
                  var curr = (leftchar >> (leftbits - 6)) & 63;
                  leftbits -= 6;
                  ret += BASE[curr];
                }
              }
              if (leftbits == 2) {
                ret += BASE[(leftchar & 3) << 4];
                ret += PAD + PAD;
              } else if (leftbits == 4) {
                ret += BASE[(leftchar & 15) << 2];
                ret += PAD;
              }
              return ret;
            }
            audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
            finish(audio);
          };
          audio.src = url;
          Browser.safeSetTimeout(function () {
            finish(audio);
          }, 1e4);
        } else {
          return fail();
        }
      };
      Module['preloadPlugins'].push(audioPlugin);
      function pointerLockChange() {
        Browser.pointerLock =
          document['pointerLockElement'] === Module['canvas'] ||
          document['mozPointerLockElement'] === Module['canvas'] ||
          document['webkitPointerLockElement'] === Module['canvas'] ||
          document['msPointerLockElement'] === Module['canvas'];
      }
      var canvas = Module['canvas'];
      if (canvas) {
        canvas.requestPointerLock =
          canvas['requestPointerLock'] ||
          canvas['mozRequestPointerLock'] ||
          canvas['webkitRequestPointerLock'] ||
          canvas['msRequestPointerLock'] ||
          function () {};
        canvas.exitPointerLock =
          document['exitPointerLock'] ||
          document['mozExitPointerLock'] ||
          document['webkitExitPointerLock'] ||
          document['msExitPointerLock'] ||
          function () {};
        canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
        document.addEventListener('pointerlockchange', pointerLockChange, false);
        document.addEventListener('mozpointerlockchange', pointerLockChange, false);
        document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
        document.addEventListener('mspointerlockchange', pointerLockChange, false);
        if (Module['elementPointerLock']) {
          canvas.addEventListener(
            'click',
            function (ev) {
              if (!Browser.pointerLock && Module['canvas'].requestPointerLock) {
                Module['canvas'].requestPointerLock();
                ev.preventDefault();
              }
            },
            false,
          );
        }
      }
    },
    createContext: function (canvas, useWebGL, setInModule, webGLContextAttributes) {
      if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
      var ctx;
      var contextHandle;
      if (useWebGL) {
        var contextAttributes = { antialias: false, alpha: false };
        if (webGLContextAttributes) {
          for (var attribute in webGLContextAttributes) {
            contextAttributes[attribute] = webGLContextAttributes[attribute];
          }
        }
        contextHandle = GL.createContext(canvas, contextAttributes);
        if (contextHandle) {
          ctx = GL.getContext(contextHandle).GLctx;
        }
      } else {
        ctx = canvas.getContext('2d');
      }
      if (!ctx) return null;
      if (setInModule) {
        if (!useWebGL)
          assert(
            typeof GLctx === 'undefined',
            'cannot set in module if GLctx is used, but we are a non-GL context that would replace it',
          );
        Module.ctx = ctx;
        if (useWebGL) GL.makeContextCurrent(contextHandle);
        Module.useWebGL = useWebGL;
        Browser.moduleContextCreatedCallbacks.forEach(function (callback) {
          callback();
        });
        Browser.init();
      }
      return ctx;
    },
    destroyContext: function (canvas, useWebGL, setInModule) {},
    fullscreenHandlersInstalled: false,
    lockPointer: undefined,
    resizeCanvas: undefined,
    requestFullscreen: function (lockPointer, resizeCanvas, vrDevice) {
      Browser.lockPointer = lockPointer;
      Browser.resizeCanvas = resizeCanvas;
      Browser.vrDevice = vrDevice;
      if (typeof Browser.lockPointer === 'undefined') Browser.lockPointer = true;
      if (typeof Browser.resizeCanvas === 'undefined') Browser.resizeCanvas = false;
      if (typeof Browser.vrDevice === 'undefined') Browser.vrDevice = null;
      var canvas = Module['canvas'];
      function fullscreenChange() {
        Browser.isFullscreen = false;
        var canvasContainer = canvas.parentNode;
        if (
          (document['fullscreenElement'] ||
            document['mozFullScreenElement'] ||
            document['msFullscreenElement'] ||
            document['webkitFullscreenElement'] ||
            document['webkitCurrentFullScreenElement']) === canvasContainer
        ) {
          canvas.exitFullscreen =
            document['exitFullscreen'] ||
            document['cancelFullScreen'] ||
            document['mozCancelFullScreen'] ||
            document['msExitFullscreen'] ||
            document['webkitCancelFullScreen'] ||
            function () {};
          canvas.exitFullscreen = canvas.exitFullscreen.bind(document);
          if (Browser.lockPointer) canvas.requestPointerLock();
          Browser.isFullscreen = true;
          if (Browser.resizeCanvas) Browser.setFullscreenCanvasSize();
        } else {
          canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
          canvasContainer.parentNode.removeChild(canvasContainer);
          if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
        }
        if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullscreen);
        if (Module['onFullscreen']) Module['onFullscreen'](Browser.isFullscreen);
        Browser.updateCanvasDimensions(canvas);
      }
      if (!Browser.fullscreenHandlersInstalled) {
        Browser.fullscreenHandlersInstalled = true;
        document.addEventListener('fullscreenchange', fullscreenChange, false);
        document.addEventListener('mozfullscreenchange', fullscreenChange, false);
        document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
        document.addEventListener('MSFullscreenChange', fullscreenChange, false);
      }
      var canvasContainer = document.createElement('div');
      canvas.parentNode.insertBefore(canvasContainer, canvas);
      canvasContainer.appendChild(canvas);
      canvasContainer.requestFullscreen =
        canvasContainer['requestFullscreen'] ||
        canvasContainer['mozRequestFullScreen'] ||
        canvasContainer['msRequestFullscreen'] ||
        (canvasContainer['webkitRequestFullscreen']
          ? function () {
              canvasContainer['webkitRequestFullscreen'](Element['ALLOW_KEYBOARD_INPUT']);
            }
          : null) ||
        (canvasContainer['webkitRequestFullScreen']
          ? function () {
              canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']);
            }
          : null);
      if (vrDevice) {
        canvasContainer.requestFullscreen({ vrDisplay: vrDevice });
      } else {
        canvasContainer.requestFullscreen();
      }
    },
    requestFullScreen: function (lockPointer, resizeCanvas, vrDevice) {
      Module.printErr(
        'Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.',
      );
      Browser.requestFullScreen = function (lockPointer, resizeCanvas, vrDevice) {
        return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
      };
      return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
    },
    nextRAF: 0,
    fakeRequestAnimationFrame: function (func) {
      var now = Date.now();
      if (Browser.nextRAF === 0) {
        Browser.nextRAF = now + 1e3 / 60;
      } else {
        while (now + 2 >= Browser.nextRAF) {
          Browser.nextRAF += 1e3 / 60;
        }
      }
      var delay = Math.max(Browser.nextRAF - now, 0);
      setTimeout(func, delay);
    },
    requestAnimationFrame: function requestAnimationFrame(func) {
      if (typeof window === 'undefined') {
        Browser.fakeRequestAnimationFrame(func);
      } else {
        if (!window.requestAnimationFrame) {
          window.requestAnimationFrame =
            window['requestAnimationFrame'] ||
            window['mozRequestAnimationFrame'] ||
            window['webkitRequestAnimationFrame'] ||
            window['msRequestAnimationFrame'] ||
            window['oRequestAnimationFrame'] ||
            Browser.fakeRequestAnimationFrame;
        }
        window.requestAnimationFrame(func);
      }
    },
    safeCallback: function (func) {
      return function () {
        if (!ABORT) return func.apply(null, arguments);
      };
    },
    allowAsyncCallbacks: true,
    queuedAsyncCallbacks: [],
    pauseAsyncCallbacks: function () {
      Browser.allowAsyncCallbacks = false;
    },
    resumeAsyncCallbacks: function () {
      Browser.allowAsyncCallbacks = true;
      if (Browser.queuedAsyncCallbacks.length > 0) {
        var callbacks = Browser.queuedAsyncCallbacks;
        Browser.queuedAsyncCallbacks = [];
        callbacks.forEach(function (func) {
          func();
        });
      }
    },
    safeRequestAnimationFrame: function (func) {
      return Browser.requestAnimationFrame(function () {
        if (ABORT) return;
        if (Browser.allowAsyncCallbacks) {
          func();
        } else {
          Browser.queuedAsyncCallbacks.push(func);
        }
      });
    },
    safeSetTimeout: function (func, timeout) {
      Module['noExitRuntime'] = true;
      return setTimeout(function () {
        if (ABORT) return;
        if (Browser.allowAsyncCallbacks) {
          func();
        } else {
          Browser.queuedAsyncCallbacks.push(func);
        }
      }, timeout);
    },
    safeSetInterval: function (func, timeout) {
      Module['noExitRuntime'] = true;
      return setInterval(function () {
        if (ABORT) return;
        if (Browser.allowAsyncCallbacks) {
          func();
        }
      }, timeout);
    },
    getMimetype: function (name) {
      return {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        bmp: 'image/bmp',
        ogg: 'audio/ogg',
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
      }[name.substr(name.lastIndexOf('.') + 1)];
    },
    getUserMedia: function (func) {
      if (!window.getUserMedia) {
        window.getUserMedia = navigator['getUserMedia'] || navigator['mozGetUserMedia'];
      }
      window.getUserMedia(func);
    },
    getMovementX: function (event) {
      return event['movementX'] || event['mozMovementX'] || event['webkitMovementX'] || 0;
    },
    getMovementY: function (event) {
      return event['movementY'] || event['mozMovementY'] || event['webkitMovementY'] || 0;
    },
    getMouseWheelDelta: function (event) {
      var delta = 0;
      switch (event.type) {
        case 'DOMMouseScroll':
          delta = event.detail;
          break;
        case 'mousewheel':
          delta = event.wheelDelta;
          break;
        case 'wheel':
          delta = event['deltaY'];
          break;
        default:
          throw 'unrecognized mouse wheel event: ' + event.type;
      }
      return delta;
    },
    mouseX: 0,
    mouseY: 0,
    mouseMovementX: 0,
    mouseMovementY: 0,
    touches: {},
    lastTouches: {},
    calculateMouseEvent: function (event) {
      if (Browser.pointerLock) {
        if (event.type != 'mousemove' && 'mozMovementX' in event) {
          Browser.mouseMovementX = Browser.mouseMovementY = 0;
        } else {
          Browser.mouseMovementX = Browser.getMovementX(event);
          Browser.mouseMovementY = Browser.getMovementY(event);
        }
        if (typeof SDL != 'undefined') {
          Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
          Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
        } else {
          Browser.mouseX += Browser.mouseMovementX;
          Browser.mouseY += Browser.mouseMovementY;
        }
      } else {
        var rect = Module['canvas'].getBoundingClientRect();
        var cw = Module['canvas'].width;
        var ch = Module['canvas'].height;
        var scrollX = typeof window.scrollX !== 'undefined' ? window.scrollX : window.pageXOffset;
        var scrollY = typeof window.scrollY !== 'undefined' ? window.scrollY : window.pageYOffset;
        if (
          event.type === 'touchstart' ||
          event.type === 'touchend' ||
          event.type === 'touchmove'
        ) {
          var touch = event.touch;
          if (touch === undefined) {
            return;
          }
          var adjustedX = touch.pageX - (scrollX + rect.left);
          var adjustedY = touch.pageY - (scrollY + rect.top);
          adjustedX = adjustedX * (cw / rect.width);
          adjustedY = adjustedY * (ch / rect.height);
          var coords = { x: adjustedX, y: adjustedY };
          if (event.type === 'touchstart') {
            Browser.lastTouches[touch.identifier] = coords;
            Browser.touches[touch.identifier] = coords;
          } else if (event.type === 'touchend' || event.type === 'touchmove') {
            var last = Browser.touches[touch.identifier];
            if (!last) last = coords;
            Browser.lastTouches[touch.identifier] = last;
            Browser.touches[touch.identifier] = coords;
          }
          return;
        }
        var x = event.pageX - (scrollX + rect.left);
        var y = event.pageY - (scrollY + rect.top);
        x = x * (cw / rect.width);
        y = y * (ch / rect.height);
        Browser.mouseMovementX = x - Browser.mouseX;
        Browser.mouseMovementY = y - Browser.mouseY;
        Browser.mouseX = x;
        Browser.mouseY = y;
      }
    },
    asyncLoad: function (url, onload, onerror, noRunDep) {
      var dep = !noRunDep ? getUniqueRunDependency('al ' + url) : '';
      Module['readAsync'](
        url,
        function (arrayBuffer) {
          assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        },
        function (event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        },
      );
      if (dep) addRunDependency(dep);
    },
    resizeListeners: [],
    updateResizeListeners: function () {
      var canvas = Module['canvas'];
      Browser.resizeListeners.forEach(function (listener) {
        listener(canvas.width, canvas.height);
      });
    },
    setCanvasSize: function (width, height, noUpdates) {
      var canvas = Module['canvas'];
      Browser.updateCanvasDimensions(canvas, width, height);
      if (!noUpdates) Browser.updateResizeListeners();
    },
    windowedWidth: 0,
    windowedHeight: 0,
    setFullscreenCanvasSize: function () {
      if (typeof SDL != 'undefined') {
        var flags = HEAPU32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2];
        flags = flags | 8388608;
        HEAP32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2] = flags;
      }
      Browser.updateResizeListeners();
    },
    setWindowedCanvasSize: function () {
      if (typeof SDL != 'undefined') {
        var flags = HEAPU32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2];
        flags = flags & ~8388608;
        HEAP32[(SDL.screen + Runtime.QUANTUM_SIZE * 0) >> 2] = flags;
      }
      Browser.updateResizeListeners();
    },
    updateCanvasDimensions: function (canvas, wNative, hNative) {
      if (wNative && hNative) {
        canvas.widthNative = wNative;
        canvas.heightNative = hNative;
      } else {
        wNative = canvas.widthNative;
        hNative = canvas.heightNative;
      }
      var w = wNative;
      var h = hNative;
      if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
        if (w / h < Module['forcedAspectRatio']) {
          w = Math.round(h * Module['forcedAspectRatio']);
        } else {
          h = Math.round(w / Module['forcedAspectRatio']);
        }
      }
      if (
        (document['fullscreenElement'] ||
          document['mozFullScreenElement'] ||
          document['msFullscreenElement'] ||
          document['webkitFullscreenElement'] ||
          document['webkitCurrentFullScreenElement']) === canvas.parentNode &&
        typeof screen != 'undefined'
      ) {
        var factor = Math.min(screen.width / w, screen.height / h);
        w = Math.round(w * factor);
        h = Math.round(h * factor);
      }
      if (Browser.resizeCanvas) {
        if (canvas.width != w) canvas.width = w;
        if (canvas.height != h) canvas.height = h;
        if (typeof canvas.style != 'undefined') {
          canvas.style.removeProperty('width');
          canvas.style.removeProperty('height');
        }
      } else {
        if (canvas.width != wNative) canvas.width = wNative;
        if (canvas.height != hNative) canvas.height = hNative;
        if (typeof canvas.style != 'undefined') {
          if (w != wNative || h != hNative) {
            canvas.style.setProperty('width', w + 'px', 'important');
            canvas.style.setProperty('height', h + 'px', 'important');
          } else {
            canvas.style.removeProperty('width');
            canvas.style.removeProperty('height');
          }
        }
      }
    },
    wgetRequests: {},
    nextWgetRequestHandle: 0,
    getNextWgetRequestHandle: function () {
      var handle = Browser.nextWgetRequestHandle;
      Browser.nextWgetRequestHandle++;
      return handle;
    },
  };
  function _emscripten_set_main_loop_timing(mode, value) {
    Browser.mainLoop.timingMode = mode;
    Browser.mainLoop.timingValue = value;
    if (!Browser.mainLoop.func) {
      return 1;
    }
    if (mode == 0) {
      Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
        var timeUntilNextTick =
          Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
        setTimeout(Browser.mainLoop.runner, timeUntilNextTick);
      };
      Browser.mainLoop.method = 'timeout';
    } else if (mode == 1) {
      Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
        Browser.requestAnimationFrame(Browser.mainLoop.runner);
      };
      Browser.mainLoop.method = 'rAF';
    } else if (mode == 2) {
      if (!window['setImmediate']) {
        var setImmediates = [];
        var emscriptenMainLoopMessageId = 'setimmediate';
        function Browser_setImmediate_messageHandler(event) {
          if (event.source === window && event.data === emscriptenMainLoopMessageId) {
            event.stopPropagation();
            setImmediates.shift()();
          }
        }
        window.addEventListener('message', Browser_setImmediate_messageHandler, true);
        window['setImmediate'] = function Browser_emulated_setImmediate(func) {
          setImmediates.push(func);
          if (ENVIRONMENT_IS_WORKER) {
            if (Module['setImmediates'] === undefined) Module['setImmediates'] = [];
            Module['setImmediates'].push(func);
            window.postMessage({ target: emscriptenMainLoopMessageId });
          } else window.postMessage(emscriptenMainLoopMessageId, '*');
        };
      }
      Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
        window['setImmediate'](Browser.mainLoop.runner);
      };
      Browser.mainLoop.method = 'immediate';
    }
    return 0;
  }
  function _emscripten_get_now() {
    abort();
  }
  function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
    Module['noExitRuntime'] = true;
    assert(
      !Browser.mainLoop.func,
      'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.',
    );
    Browser.mainLoop.func = func;
    Browser.mainLoop.arg = arg;
    var browserIterationFunc;
    if (typeof arg !== 'undefined') {
      browserIterationFunc = function () {
        Module['dynCall_vi'](func, arg);
      };
    } else {
      browserIterationFunc = function () {
        Module['dynCall_v'](func);
      };
    }
    var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
    Browser.mainLoop.runner = function Browser_mainLoop_runner() {
      if (ABORT) return;
      if (Browser.mainLoop.queue.length > 0) {
        var start = Date.now();
        var blocker = Browser.mainLoop.queue.shift();
        blocker.func(blocker.arg);
        if (Browser.mainLoop.remainingBlockers) {
          var remaining = Browser.mainLoop.remainingBlockers;
          var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
          if (blocker.counted) {
            Browser.mainLoop.remainingBlockers = next;
          } else {
            next = next + 0.5;
            Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
          }
        }
        console.log(
          'main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms',
        );
        Browser.mainLoop.updateStatus();
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
        setTimeout(Browser.mainLoop.runner, 0);
        return;
      }
      if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
      Browser.mainLoop.currentFrameNumber = (Browser.mainLoop.currentFrameNumber + 1) | 0;
      if (
        Browser.mainLoop.timingMode == 1 &&
        Browser.mainLoop.timingValue > 1 &&
        Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0
      ) {
        Browser.mainLoop.scheduler();
        return;
      } else if (Browser.mainLoop.timingMode == 0) {
        Browser.mainLoop.tickStartTime = _emscripten_get_now();
      }
      if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
        Module.printErr(
          'Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!',
        );
        Browser.mainLoop.method = '';
      }
      Browser.mainLoop.runIter(browserIterationFunc);
      if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
      if (typeof SDL === 'object' && SDL.audio && SDL.audio.queueNewAudioData)
        SDL.audio.queueNewAudioData();
      Browser.mainLoop.scheduler();
    };
    if (!noSetTiming) {
      if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
      else _emscripten_set_main_loop_timing(1, 1);
      Browser.mainLoop.scheduler();
    }
    if (simulateInfiniteLoop) {
      throw 'SimulateInfiniteLoop';
    }
  }
  function _emscripten_get_now_is_monotonic() {
    return (
      ENVIRONMENT_IS_NODE ||
      typeof dateNow !== 'undefined' ||
      ((ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) &&
        self['performance'] &&
        self['performance']['now'])
    );
  }
  function _clock_gettime(clk_id, tp) {
    var now;
    if (clk_id === 0) {
      now = Date.now();
    } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
      now = _emscripten_get_now();
    } else {
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }
    HEAP32[tp >> 2] = (now / 1e3) | 0;
    HEAP32[(tp + 4) >> 2] = ((now % 1e3) * 1e3 * 1e3) | 0;
    return 0;
  }
  function ___clock_gettime() {
    return _clock_gettime.apply(null, arguments);
  }
  function _localtime_r(time, tmPtr) {
    _tzset();
    var date = new Date(HEAP32[time >> 2] * 1e3);
    HEAP32[tmPtr >> 2] = date.getSeconds();
    HEAP32[(tmPtr + 4) >> 2] = date.getMinutes();
    HEAP32[(tmPtr + 8) >> 2] = date.getHours();
    HEAP32[(tmPtr + 12) >> 2] = date.getDate();
    HEAP32[(tmPtr + 16) >> 2] = date.getMonth();
    HEAP32[(tmPtr + 20) >> 2] = date.getFullYear() - 1900;
    HEAP32[(tmPtr + 24) >> 2] = date.getDay();
    var start = new Date(date.getFullYear(), 0, 1);
    var yday = ((date.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)) | 0;
    HEAP32[(tmPtr + 28) >> 2] = yday;
    HEAP32[(tmPtr + 36) >> 2] = -(date.getTimezoneOffset() * 60);
    var summerOffset = new Date(2e3, 6, 1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dst = (date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
    HEAP32[(tmPtr + 32) >> 2] = dst;
    var zonePtr = HEAP32[(_tzname + (dst ? Runtime.QUANTUM_SIZE : 0)) >> 2];
    HEAP32[(tmPtr + 40) >> 2] = zonePtr;
    return tmPtr;
  }
  function ___syscall12(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var path = SYSCALLS.getStr();
      FS.chdir(path);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall9(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var oldpath = SYSCALLS.get(),
        newpath = SYSCALLS.get();
      return -ERRNO_CODES.EMLINK;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall3(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        buf = SYSCALLS.get(),
        count = SYSCALLS.get();
      return FS.read(stream, HEAP8, buf, count);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall5(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var pathname = SYSCALLS.getStr(),
        flags = SYSCALLS.get(),
        mode = SYSCALLS.get();
      var stream = FS.open(pathname, flags, mode);
      return stream.fd;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall4(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        buf = SYSCALLS.get(),
        count = SYSCALLS.get();
      return FS.write(stream, HEAP8, buf, count);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall6(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function _getgrnam() {
    Module['printErr']('missing function: getgrnam');
    abort(-1);
  }
  var SOCKFS = {
    mount: function (mount) {
      Module['websocket'] =
        Module['websocket'] && 'object' === typeof Module['websocket'] ? Module['websocket'] : {};
      Module['websocket']._callbacks = {};
      Module['websocket']['on'] = function (event, callback) {
        if ('function' === typeof callback) {
          this._callbacks[event] = callback;
        }
        return this;
      };
      Module['websocket'].emit = function (event, param) {
        if ('function' === typeof this._callbacks[event]) {
          this._callbacks[event].call(this, param);
        }
      };
      return FS.createNode(null, '/', 16384 | 511, 0);
    },
    createSocket: function (family, type, protocol) {
      var streaming = type == 1;
      if (protocol) {
        assert(streaming == (protocol == 6));
      }
      var sock = {
        family: family,
        type: type,
        protocol: protocol,
        server: null,
        error: null,
        peers: {},
        pending: [],
        recv_queue: [],
        sock_ops: SOCKFS.websocket_sock_ops,
      };
      var name = SOCKFS.nextname();
      var node = FS.createNode(SOCKFS.root, name, 49152, 0);
      node.sock = sock;
      var stream = FS.createStream({
        path: name,
        node: node,
        flags: FS.modeStringToFlags('r+'),
        seekable: false,
        stream_ops: SOCKFS.stream_ops,
      });
      sock.stream = stream;
      return sock;
    },
    getSocket: function (fd) {
      var stream = FS.getStream(fd);
      if (!stream || !FS.isSocket(stream.node.mode)) {
        return null;
      }
      return stream.node.sock;
    },
    stream_ops: {
      poll: function (stream) {
        var sock = stream.node.sock;
        return sock.sock_ops.poll(sock);
      },
      ioctl: function (stream, request, varargs) {
        var sock = stream.node.sock;
        return sock.sock_ops.ioctl(sock, request, varargs);
      },
      read: function (stream, buffer, offset, length, position) {
        var sock = stream.node.sock;
        var msg = sock.sock_ops.recvmsg(sock, length);
        if (!msg) {
          return 0;
        }
        buffer.set(msg.buffer, offset);
        return msg.buffer.length;
      },
      write: function (stream, buffer, offset, length, position) {
        var sock = stream.node.sock;
        return sock.sock_ops.sendmsg(sock, buffer, offset, length);
      },
      close: function (stream) {
        var sock = stream.node.sock;
        sock.sock_ops.close(sock);
      },
    },
    nextname: function () {
      if (!SOCKFS.nextname.current) {
        SOCKFS.nextname.current = 0;
      }
      return 'socket[' + SOCKFS.nextname.current++ + ']';
    },
    websocket_sock_ops: {
      createPeer: function (sock, addr, port) {
        var ws;
        if (typeof addr === 'object') {
          ws = addr;
          addr = null;
          port = null;
        }
        if (ws) {
          if (ws._socket) {
            addr = ws._socket.remoteAddress;
            port = ws._socket.remotePort;
          } else {
            var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
            if (!result) {
              throw new Error('WebSocket URL must be in the format ws(s)://address:port');
            }
            addr = result[1];
            port = parseInt(result[2], 10);
          }
        } else {
          try {
            var runtimeConfig = Module['websocket'] && 'object' === typeof Module['websocket'];
            var url = 'ws:#'.replace('#', '//');
            if (runtimeConfig) {
              if ('string' === typeof Module['websocket']['url']) {
                url = Module['websocket']['url'];
              }
            }
            if (url === 'ws://' || url === 'wss://') {
              var parts = addr.split('/');
              url = url + parts[0] + ':' + port + '/' + parts.slice(1).join('/');
            }
            var subProtocols = 'binary';
            if (runtimeConfig) {
              if ('string' === typeof Module['websocket']['subprotocol']) {
                subProtocols = Module['websocket']['subprotocol'];
              }
            }
            subProtocols = subProtocols.replace(/^ +| +$/g, '').split(/ *, */);
            var opts = ENVIRONMENT_IS_NODE ? { protocol: subProtocols.toString() } : subProtocols;
            var WebSocketConstructor;
            if (ENVIRONMENT_IS_NODE) {
              WebSocketConstructor = require('ws');
            } else if (ENVIRONMENT_IS_WEB) {
              WebSocketConstructor = window['WebSocket'];
            } else {
              WebSocketConstructor = WebSocket;
            }
            ws = new WebSocketConstructor(url, opts);
            ws.binaryType = 'arraybuffer';
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EHOSTUNREACH);
          }
        }
        var peer = { addr: addr, port: port, socket: ws, dgram_send_queue: [] };
        SOCKFS.websocket_sock_ops.addPeer(sock, peer);
        SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
        if (sock.type === 2 && typeof sock.sport !== 'undefined') {
          peer.dgram_send_queue.push(
            new Uint8Array([
              255,
              255,
              255,
              255,
              'p'.charCodeAt(0),
              'o'.charCodeAt(0),
              'r'.charCodeAt(0),
              't'.charCodeAt(0),
              (sock.sport & 65280) >> 8,
              sock.sport & 255,
            ]),
          );
        }
        return peer;
      },
      getPeer: function (sock, addr, port) {
        return sock.peers[addr + ':' + port];
      },
      addPeer: function (sock, peer) {
        sock.peers[peer.addr + ':' + peer.port] = peer;
      },
      removePeer: function (sock, peer) {
        delete sock.peers[peer.addr + ':' + peer.port];
      },
      handlePeerEvents: function (sock, peer) {
        var first = true;
        var handleOpen = function () {
          Module['websocket'].emit('open', sock.stream.fd);
          try {
            var queued = peer.dgram_send_queue.shift();
            while (queued) {
              peer.socket.send(queued);
              queued = peer.dgram_send_queue.shift();
            }
          } catch (e) {
            peer.socket.close();
          }
        };
        function handleMessage(data) {
          assert(typeof data !== 'string' && data.byteLength !== undefined);
          if (data.byteLength == 0) {
            return;
          }
          data = new Uint8Array(data);
          var wasfirst = first;
          first = false;
          if (
            wasfirst &&
            data.length === 10 &&
            data[0] === 255 &&
            data[1] === 255 &&
            data[2] === 255 &&
            data[3] === 255 &&
            data[4] === 'p'.charCodeAt(0) &&
            data[5] === 'o'.charCodeAt(0) &&
            data[6] === 'r'.charCodeAt(0) &&
            data[7] === 't'.charCodeAt(0)
          ) {
            var newport = (data[8] << 8) | data[9];
            SOCKFS.websocket_sock_ops.removePeer(sock, peer);
            peer.port = newport;
            SOCKFS.websocket_sock_ops.addPeer(sock, peer);
            return;
          }
          sock.recv_queue.push({ addr: peer.addr, port: peer.port, data: data });
          Module['websocket'].emit('message', sock.stream.fd);
        }
        if (ENVIRONMENT_IS_NODE) {
          peer.socket.on('open', handleOpen);
          peer.socket.on('message', function (data, flags) {
            if (!flags.binary) {
              return;
            }
            handleMessage(new Uint8Array(data).buffer);
          });
          peer.socket.on('close', function () {
            Module['websocket'].emit('close', sock.stream.fd);
          });
          peer.socket.on('error', function (error) {
            sock.error = ERRNO_CODES.ECONNREFUSED;
            Module['websocket'].emit('error', [
              sock.stream.fd,
              sock.error,
              'ECONNREFUSED: Connection refused',
            ]);
          });
        } else {
          peer.socket.onopen = handleOpen;
          peer.socket.onclose = function () {
            Module['websocket'].emit('close', sock.stream.fd);
          };
          peer.socket.onmessage = function peer_socket_onmessage(event) {
            handleMessage(event.data);
          };
          peer.socket.onerror = function (error) {
            sock.error = ERRNO_CODES.ECONNREFUSED;
            Module['websocket'].emit('error', [
              sock.stream.fd,
              sock.error,
              'ECONNREFUSED: Connection refused',
            ]);
          };
        }
      },
      poll: function (sock) {
        if (sock.type === 1 && sock.server) {
          return sock.pending.length ? 64 | 1 : 0;
        }
        var mask = 0;
        var dest =
          sock.type === 1 ? SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) : null;
        if (
          sock.recv_queue.length ||
          !dest ||
          (dest && dest.socket.readyState === dest.socket.CLOSING) ||
          (dest && dest.socket.readyState === dest.socket.CLOSED)
        ) {
          mask |= 64 | 1;
        }
        if (!dest || (dest && dest.socket.readyState === dest.socket.OPEN)) {
          mask |= 4;
        }
        if (
          (dest && dest.socket.readyState === dest.socket.CLOSING) ||
          (dest && dest.socket.readyState === dest.socket.CLOSED)
        ) {
          mask |= 16;
        }
        return mask;
      },
      ioctl: function (sock, request, arg) {
        switch (request) {
          case 21531:
            var bytes = 0;
            if (sock.recv_queue.length) {
              bytes = sock.recv_queue[0].data.length;
            }
            HEAP32[arg >> 2] = bytes;
            return 0;
          default:
            return ERRNO_CODES.EINVAL;
        }
      },
      close: function (sock) {
        if (sock.server) {
          try {
            sock.server.close();
          } catch (e) {}
          sock.server = null;
        }
        var peers = Object.keys(sock.peers);
        for (var i = 0; i < peers.length; i++) {
          var peer = sock.peers[peers[i]];
          try {
            peer.socket.close();
          } catch (e) {}
          SOCKFS.websocket_sock_ops.removePeer(sock, peer);
        }
        return 0;
      },
      bind: function (sock, addr, port) {
        if (typeof sock.saddr !== 'undefined' || typeof sock.sport !== 'undefined') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        sock.saddr = addr;
        sock.sport = port;
        if (sock.type === 2) {
          if (sock.server) {
            sock.server.close();
            sock.server = null;
          }
          try {
            sock.sock_ops.listen(sock, 0);
          } catch (e) {
            if (!(e instanceof FS.ErrnoError)) throw e;
            if (e.errno !== ERRNO_CODES.EOPNOTSUPP) throw e;
          }
        }
      },
      connect: function (sock, addr, port) {
        if (sock.server) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        if (typeof sock.daddr !== 'undefined' && typeof sock.dport !== 'undefined') {
          var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
          if (dest) {
            if (dest.socket.readyState === dest.socket.CONNECTING) {
              throw new FS.ErrnoError(ERRNO_CODES.EALREADY);
            } else {
              throw new FS.ErrnoError(ERRNO_CODES.EISCONN);
            }
          }
        }
        var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
        sock.daddr = peer.addr;
        sock.dport = peer.port;
        throw new FS.ErrnoError(ERRNO_CODES.EINPROGRESS);
      },
      listen: function (sock, backlog) {
        if (!ENVIRONMENT_IS_NODE) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        if (sock.server) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var WebSocketServer = require('ws').Server;
        var host = sock.saddr;
        sock.server = new WebSocketServer({ host: host, port: sock.sport });
        Module['websocket'].emit('listen', sock.stream.fd);
        sock.server.on('connection', function (ws) {
          if (sock.type === 1) {
            var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);
            var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
            newsock.daddr = peer.addr;
            newsock.dport = peer.port;
            sock.pending.push(newsock);
            Module['websocket'].emit('connection', newsock.stream.fd);
          } else {
            SOCKFS.websocket_sock_ops.createPeer(sock, ws);
            Module['websocket'].emit('connection', sock.stream.fd);
          }
        });
        sock.server.on('closed', function () {
          Module['websocket'].emit('close', sock.stream.fd);
          sock.server = null;
        });
        sock.server.on('error', function (error) {
          sock.error = ERRNO_CODES.EHOSTUNREACH;
          Module['websocket'].emit('error', [
            sock.stream.fd,
            sock.error,
            'EHOSTUNREACH: Host is unreachable',
          ]);
        });
      },
      accept: function (listensock) {
        if (!listensock.server) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var newsock = listensock.pending.shift();
        newsock.stream.flags = listensock.stream.flags;
        return newsock;
      },
      getname: function (sock, peer) {
        var addr, port;
        if (peer) {
          if (sock.daddr === undefined || sock.dport === undefined) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
          }
          addr = sock.daddr;
          port = sock.dport;
        } else {
          addr = sock.saddr || 0;
          port = sock.sport || 0;
        }
        return { addr: addr, port: port };
      },
      sendmsg: function (sock, buffer, offset, length, addr, port) {
        if (sock.type === 2) {
          if (addr === undefined || port === undefined) {
            addr = sock.daddr;
            port = sock.dport;
          }
          if (addr === undefined || port === undefined) {
            throw new FS.ErrnoError(ERRNO_CODES.EDESTADDRREQ);
          }
        } else {
          addr = sock.daddr;
          port = sock.dport;
        }
        var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
        if (sock.type === 1) {
          if (
            !dest ||
            dest.socket.readyState === dest.socket.CLOSING ||
            dest.socket.readyState === dest.socket.CLOSED
          ) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
          } else if (dest.socket.readyState === dest.socket.CONNECTING) {
            throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
          }
        }
        var data;
        if (buffer instanceof Array || buffer instanceof ArrayBuffer) {
          data = buffer.slice(offset, offset + length);
        } else {
          data = buffer.buffer.slice(
            buffer.byteOffset + offset,
            buffer.byteOffset + offset + length,
          );
        }
        if (sock.type === 2) {
          if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
            if (
              !dest ||
              dest.socket.readyState === dest.socket.CLOSING ||
              dest.socket.readyState === dest.socket.CLOSED
            ) {
              dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
            }
            dest.dgram_send_queue.push(data);
            return length;
          }
        }
        try {
          dest.socket.send(data);
          return length;
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },
      recvmsg: function (sock, length) {
        if (sock.type === 1 && sock.server) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
        }
        var queued = sock.recv_queue.shift();
        if (!queued) {
          if (sock.type === 1) {
            var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
            if (!dest) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
            } else if (
              dest.socket.readyState === dest.socket.CLOSING ||
              dest.socket.readyState === dest.socket.CLOSED
            ) {
              return null;
            } else {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
          } else {
            throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
          }
        }
        var queuedLength = queued.data.byteLength || queued.data.length;
        var queuedOffset = queued.data.byteOffset || 0;
        var queuedBuffer = queued.data.buffer || queued.data;
        var bytesRead = Math.min(length, queuedLength);
        var res = {
          buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead),
          addr: queued.addr,
          port: queued.port,
        };
        if (sock.type === 1 && bytesRead < queuedLength) {
          var bytesRemaining = queuedLength - bytesRead;
          queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
          sock.recv_queue.unshift(queued);
        }
        return res;
      },
    },
  };
  function __read_sockaddr(sa, salen) {
    var family = HEAP16[sa >> 1];
    var port = _ntohs(HEAP16[(sa + 2) >> 1]);
    var addr;
    switch (family) {
      case 2:
        if (salen !== 16) {
          return { errno: ERRNO_CODES.EINVAL };
        }
        addr = HEAP32[(sa + 4) >> 2];
        addr = __inet_ntop4_raw(addr);
        break;
      case 10:
        if (salen !== 28) {
          return { errno: ERRNO_CODES.EINVAL };
        }
        addr = [
          HEAP32[(sa + 8) >> 2],
          HEAP32[(sa + 12) >> 2],
          HEAP32[(sa + 16) >> 2],
          HEAP32[(sa + 20) >> 2],
        ];
        addr = __inet_ntop6_raw(addr);
        break;
      default:
        return { errno: ERRNO_CODES.EAFNOSUPPORT };
    }
    return { family: family, addr: addr, port: port };
  }
  function ___syscall102(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var call = SYSCALLS.get(),
        socketvararg = SYSCALLS.get();
      SYSCALLS.varargs = socketvararg;
      switch (call) {
        case 1: {
          var domain = SYSCALLS.get(),
            type = SYSCALLS.get(),
            protocol = SYSCALLS.get();
          var sock = SOCKFS.createSocket(domain, type, protocol);
          assert(sock.stream.fd < 64);
          return sock.stream.fd;
        }
        case 2: {
          var sock = SYSCALLS.getSocketFromFD(),
            info = SYSCALLS.getSocketAddress();
          sock.sock_ops.bind(sock, info.addr, info.port);
          return 0;
        }
        case 3: {
          var sock = SYSCALLS.getSocketFromFD(),
            info = SYSCALLS.getSocketAddress();
          sock.sock_ops.connect(sock, info.addr, info.port);
          return 0;
        }
        case 4: {
          var sock = SYSCALLS.getSocketFromFD(),
            backlog = SYSCALLS.get();
          sock.sock_ops.listen(sock, backlog);
          return 0;
        }
        case 5: {
          var sock = SYSCALLS.getSocketFromFD(),
            addr = SYSCALLS.get(),
            addrlen = SYSCALLS.get();
          var newsock = sock.sock_ops.accept(sock);
          if (addr) {
            var res = __write_sockaddr(
              addr,
              newsock.family,
              DNS.lookup_name(newsock.daddr),
              newsock.dport,
            );
            assert(!res.errno);
          }
          return newsock.stream.fd;
        }
        case 6: {
          var sock = SYSCALLS.getSocketFromFD(),
            addr = SYSCALLS.get(),
            addrlen = SYSCALLS.get();
          var res = __write_sockaddr(
            addr,
            sock.family,
            DNS.lookup_name(sock.saddr || '0.0.0.0'),
            sock.sport,
          );
          assert(!res.errno);
          return 0;
        }
        case 7: {
          var sock = SYSCALLS.getSocketFromFD(),
            addr = SYSCALLS.get(),
            addrlen = SYSCALLS.get();
          if (!sock.daddr) {
            return -ERRNO_CODES.ENOTCONN;
          }
          var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(sock.daddr), sock.dport);
          assert(!res.errno);
          return 0;
        }
        case 11: {
          var sock = SYSCALLS.getSocketFromFD(),
            message = SYSCALLS.get(),
            length = SYSCALLS.get(),
            flags = SYSCALLS.get(),
            dest = SYSCALLS.getSocketAddress(true);
          if (!dest) {
            return FS.write(sock.stream, HEAP8, message, length);
          } else {
            return sock.sock_ops.sendmsg(sock, HEAP8, message, length, dest.addr, dest.port);
          }
        }
        case 12: {
          var sock = SYSCALLS.getSocketFromFD(),
            buf = SYSCALLS.get(),
            len = SYSCALLS.get(),
            flags = SYSCALLS.get(),
            addr = SYSCALLS.get(),
            addrlen = SYSCALLS.get();
          var msg = sock.sock_ops.recvmsg(sock, len);
          if (!msg) return 0;
          if (addr) {
            var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(msg.addr), msg.port);
            assert(!res.errno);
          }
          HEAPU8.set(msg.buffer, buf);
          return msg.buffer.byteLength;
        }
        case 14: {
          return -ERRNO_CODES.ENOPROTOOPT;
        }
        case 15: {
          var sock = SYSCALLS.getSocketFromFD(),
            level = SYSCALLS.get(),
            optname = SYSCALLS.get(),
            optval = SYSCALLS.get(),
            optlen = SYSCALLS.get();
          if (level === 1) {
            if (optname === 4) {
              HEAP32[optval >> 2] = sock.error;
              HEAP32[optlen >> 2] = 4;
              sock.error = null;
              return 0;
            }
          }
          return -ERRNO_CODES.ENOPROTOOPT;
        }
        case 16: {
          var sock = SYSCALLS.getSocketFromFD(),
            message = SYSCALLS.get(),
            flags = SYSCALLS.get();
          var iov = HEAP32[(message + 8) >> 2];
          var num = HEAP32[(message + 12) >> 2];
          var addr, port;
          var name = HEAP32[message >> 2];
          var namelen = HEAP32[(message + 4) >> 2];
          if (name) {
            var info = __read_sockaddr(name, namelen);
            if (info.errno) return -info.errno;
            port = info.port;
            addr = DNS.lookup_addr(info.addr) || info.addr;
          }
          var total = 0;
          for (var i = 0; i < num; i++) {
            total += HEAP32[(iov + (8 * i + 4)) >> 2];
          }
          var view = new Uint8Array(total);
          var offset = 0;
          for (var i = 0; i < num; i++) {
            var iovbase = HEAP32[(iov + (8 * i + 0)) >> 2];
            var iovlen = HEAP32[(iov + (8 * i + 4)) >> 2];
            for (var j = 0; j < iovlen; j++) {
              view[offset++] = HEAP8[(iovbase + j) >> 0];
            }
          }
          return sock.sock_ops.sendmsg(sock, view, 0, total, addr, port);
        }
        case 17: {
          var sock = SYSCALLS.getSocketFromFD(),
            message = SYSCALLS.get(),
            flags = SYSCALLS.get();
          var iov = HEAP32[(message + 8) >> 2];
          var num = HEAP32[(message + 12) >> 2];
          var total = 0;
          for (var i = 0; i < num; i++) {
            total += HEAP32[(iov + (8 * i + 4)) >> 2];
          }
          var msg = sock.sock_ops.recvmsg(sock, total);
          if (!msg) return 0;
          var name = HEAP32[message >> 2];
          if (name) {
            var res = __write_sockaddr(name, sock.family, DNS.lookup_name(msg.addr), msg.port);
            assert(!res.errno);
          }
          var bytesRead = 0;
          var bytesRemaining = msg.buffer.byteLength;
          for (var i = 0; bytesRemaining > 0 && i < num; i++) {
            var iovbase = HEAP32[(iov + (8 * i + 0)) >> 2];
            var iovlen = HEAP32[(iov + (8 * i + 4)) >> 2];
            if (!iovlen) {
              continue;
            }
            var length = Math.min(iovlen, bytesRemaining);
            var buf = msg.buffer.subarray(bytesRead, bytesRead + length);
            HEAPU8.set(buf, iovbase + bytesRead);
            bytesRead += length;
            bytesRemaining -= length;
          }
          return bytesRead;
        }
        default:
          abort('unsupported socketcall syscall ' + call);
      }
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function _time(ptr) {
    var ret = (Date.now() / 1e3) | 0;
    if (ptr) {
      HEAP32[ptr >> 2] = ret;
    }
    return ret;
  }
  function ___syscall142(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var nfds = SYSCALLS.get(),
        readfds = SYSCALLS.get(),
        writefds = SYSCALLS.get(),
        exceptfds = SYSCALLS.get(),
        timeout = SYSCALLS.get();
      assert(nfds <= 64, 'nfds must be less than or equal to 64');
      assert(!exceptfds, 'exceptfds not supported');
      var total = 0;
      var srcReadLow = readfds ? HEAP32[readfds >> 2] : 0,
        srcReadHigh = readfds ? HEAP32[(readfds + 4) >> 2] : 0;
      var srcWriteLow = writefds ? HEAP32[writefds >> 2] : 0,
        srcWriteHigh = writefds ? HEAP32[(writefds + 4) >> 2] : 0;
      var srcExceptLow = exceptfds ? HEAP32[exceptfds >> 2] : 0,
        srcExceptHigh = exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0;
      var dstReadLow = 0,
        dstReadHigh = 0;
      var dstWriteLow = 0,
        dstWriteHigh = 0;
      var dstExceptLow = 0,
        dstExceptHigh = 0;
      var allLow =
        (readfds ? HEAP32[readfds >> 2] : 0) |
        (writefds ? HEAP32[writefds >> 2] : 0) |
        (exceptfds ? HEAP32[exceptfds >> 2] : 0);
      var allHigh =
        (readfds ? HEAP32[(readfds + 4) >> 2] : 0) |
        (writefds ? HEAP32[(writefds + 4) >> 2] : 0) |
        (exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0);
      function check(fd, low, high, val) {
        return fd < 32 ? low & val : high & val;
      }
      for (var fd = 0; fd < nfds; fd++) {
        var mask = 1 << fd % 32;
        if (!check(fd, allLow, allHigh, mask)) {
          continue;
        }
        var stream = FS.getStream(fd);
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        var flags = SYSCALLS.DEFAULT_POLLMASK;
        if (stream.stream_ops.poll) {
          flags = stream.stream_ops.poll(stream);
        }
        if (flags & 1 && check(fd, srcReadLow, srcReadHigh, mask)) {
          fd < 32 ? (dstReadLow = dstReadLow | mask) : (dstReadHigh = dstReadHigh | mask);
          total++;
        }
        if (flags & 4 && check(fd, srcWriteLow, srcWriteHigh, mask)) {
          fd < 32 ? (dstWriteLow = dstWriteLow | mask) : (dstWriteHigh = dstWriteHigh | mask);
          total++;
        }
        if (flags & 2 && check(fd, srcExceptLow, srcExceptHigh, mask)) {
          fd < 32 ? (dstExceptLow = dstExceptLow | mask) : (dstExceptHigh = dstExceptHigh | mask);
          total++;
        }
      }
      if (readfds) {
        HEAP32[readfds >> 2] = dstReadLow;
        HEAP32[(readfds + 4) >> 2] = dstReadHigh;
      }
      if (writefds) {
        HEAP32[writefds >> 2] = dstWriteLow;
        HEAP32[(writefds + 4) >> 2] = dstWriteHigh;
      }
      if (exceptfds) {
        HEAP32[exceptfds >> 2] = dstExceptLow;
        HEAP32[(exceptfds + 4) >> 2] = dstExceptHigh;
      }
      return total;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall140(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        offset_high = SYSCALLS.get(),
        offset_low = SYSCALLS.get(),
        result = SYSCALLS.get(),
        whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[result >> 2] = stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
      return 0;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall220(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        dirp = SYSCALLS.get(),
        count = SYSCALLS.get();
      if (!stream.getdents) {
        stream.getdents = FS.readdir(stream.path);
      }
      var pos = 0;
      while (stream.getdents.length > 0 && pos + 268 <= count) {
        var id;
        var type;
        var name = stream.getdents.pop();
        assert(name.length < 256);
        if (name[0] === '.') {
          id = 1;
          type = 4;
        } else {
          var child = FS.lookupNode(stream.node, name);
          id = child.id;
          type = FS.isChrdev(child.mode)
            ? 2
            : FS.isDir(child.mode)
              ? 4
              : FS.isLink(child.mode)
                ? 10
                : 8;
        }
        HEAP32[(dirp + pos) >> 2] = id;
        HEAP32[(dirp + pos + 4) >> 2] = stream.position;
        HEAP16[(dirp + pos + 8) >> 1] = 268;
        HEAP8[(dirp + pos + 10) >> 0] = type;
        for (var i = 0; i < name.length; i++) {
          HEAP8[(dirp + pos + (11 + i)) >> 0] = name.charCodeAt(i);
        }
        HEAP8[(dirp + pos + (11 + i)) >> 0] = 0;
        pos += 268;
      }
      return pos;
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall146(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        iov = SYSCALLS.get(),
        iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall221(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        cmd = SYSCALLS.get();
      switch (cmd) {
        case 0: {
          var arg = SYSCALLS.get();
          if (arg < 0) {
            return -ERRNO_CODES.EINVAL;
          }
          var newStream;
          newStream = FS.open(stream.path, stream.flags, 0, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;
        case 3:
          return stream.flags;
        case 4: {
          var arg = SYSCALLS.get();
          stream.flags |= arg;
          return 0;
        }
        case 12:
        case 12: {
          var arg = SYSCALLS.get();
          var offset = 0;
          HEAP16[(arg + offset) >> 1] = 2;
          return 0;
        }
        case 13:
        case 14:
        case 13:
        case 14:
          return 0;
        case 16:
        case 8:
          return -ERRNO_CODES.EINVAL;
        case 9:
          ___setErrNo(ERRNO_CODES.EINVAL);
          return -1;
        default: {
          return -ERRNO_CODES.EINVAL;
        }
      }
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  function ___syscall145(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(),
        iov = SYSCALLS.get(),
        iovcnt = SYSCALLS.get();
      return SYSCALLS.doReadv(stream, iov, iovcnt);
    } catch (e) {
      if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
      return -e.errno;
    }
  }
  FS.staticInit();
  __ATINIT__.unshift(function () {
    if (!Module['noFSInit'] && !FS.init.initialized) FS.init();
  });
  __ATMAIN__.push(function () {
    FS.ignorePermissions = false;
  });
  __ATEXIT__.push(function () {
    FS.quit();
  });
  Module['FS_createFolder'] = FS.createFolder;
  Module['FS_createPath'] = FS.createPath;
  Module['FS_createDataFile'] = FS.createDataFile;
  Module['FS_createPreloadedFile'] = FS.createPreloadedFile;
  Module['FS_createLazyFile'] = FS.createLazyFile;
  Module['FS_createLink'] = FS.createLink;
  Module['FS_createDevice'] = FS.createDevice;
  Module['FS_unlink'] = FS.unlink;
  __ATINIT__.unshift(function () {
    TTY.init();
  });
  __ATEXIT__.push(function () {
    TTY.shutdown();
  });
  if (ENVIRONMENT_IS_NODE) {
    var fs = require('fs');
    var NODEJS_PATH = require('path');
    NODEFS.staticInit();
  }
  ___buildEnvironment(ENV);
  Module['requestFullScreen'] = function Module_requestFullScreen(
    lockPointer,
    resizeCanvas,
    vrDevice,
  ) {
    Module.printErr(
      'Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead.',
    );
    Module['requestFullScreen'] = Module['requestFullscreen'];
    Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice);
  };
  Module['requestFullscreen'] = function Module_requestFullscreen(
    lockPointer,
    resizeCanvas,
    vrDevice,
  ) {
    Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
  };
  Module['requestAnimationFrame'] = function Module_requestAnimationFrame(func) {
    Browser.requestAnimationFrame(func);
  };
  Module['setCanvasSize'] = function Module_setCanvasSize(width, height, noUpdates) {
    Browser.setCanvasSize(width, height, noUpdates);
  };
  Module['pauseMainLoop'] = function Module_pauseMainLoop() {
    Browser.mainLoop.pause();
  };
  Module['resumeMainLoop'] = function Module_resumeMainLoop() {
    Browser.mainLoop.resume();
  };
  Module['getUserMedia'] = function Module_getUserMedia() {
    Browser.getUserMedia();
  };
  Module['createContext'] = function Module_createContext(
    canvas,
    useWebGL,
    setInModule,
    webGLContextAttributes,
  ) {
    return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes);
  };
  if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
      var t = process['hrtime']();
      return t[0] * 1e3 + t[1] / 1e6;
    };
  } else if (typeof dateNow !== 'undefined') {
    _emscripten_get_now = dateNow;
  } else if (
    typeof self === 'object' &&
    self['performance'] &&
    typeof self['performance']['now'] === 'function'
  ) {
    _emscripten_get_now = function () {
      return self['performance']['now']();
    };
  } else if (typeof performance === 'object' && typeof performance['now'] === 'function') {
    _emscripten_get_now = function () {
      return performance['now']();
    };
  } else {
    _emscripten_get_now = Date.now;
  }
  __ATINIT__.push(function () {
    SOCKFS.root = FS.mount(SOCKFS, {}, null);
  });
  DYNAMICTOP_PTR = allocate(1, 'i32', ALLOC_STATIC);
  STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
  STACK_MAX = STACK_BASE + TOTAL_STACK;
  DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);
  HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
  staticSealed = true;
  Module['wasmTableSize'] = 12288;
  Module['wasmMaxTableSize'] = 12288;
  function invoke_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
    try {
      return Module['dynCall_iiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6, a7);
  }
  function invoke_jijii(index, a1, a2, a3, a4, a5) {
    try {
      return Module['dynCall_jijii'](index, a1, a2, a3, a4, a5);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_jijii(index, a1, a2, a3, a4) {
    return Runtime.functionPointers[index](a1, a2, a3, a4);
  }
  function invoke_vid(index, a1, a2) {
    try {
      Module['dynCall_vid'](index, a1, a2);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_vid(index, a1, a2) {
    Runtime.functionPointers[index](a1, a2);
  }
  function invoke_viiiii(index, a1, a2, a3, a4, a5) {
    try {
      Module['dynCall_viiiii'](index, a1, a2, a3, a4, a5);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_viiiii(index, a1, a2, a3, a4, a5) {
    Runtime.functionPointers[index](a1, a2, a3, a4, a5);
  }
  function invoke_vij(index, a1, a2, a3) {
    try {
      Module['dynCall_vij'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_vij(index, a1, a2) {
    Runtime.functionPointers[index](a1, a2);
  }
  function invoke_vi(index, a1) {
    try {
      Module['dynCall_vi'](index, a1);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_vi(index, a1) {
    Runtime.functionPointers[index](a1);
  }
  function invoke_vii(index, a1, a2) {
    try {
      Module['dynCall_vii'](index, a1, a2);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_vii(index, a1, a2) {
    Runtime.functionPointers[index](a1, a2);
  }
  function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
      return Module['dynCall_iiiiiii'](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6);
  }
  function invoke_iiiiji(index, a1, a2, a3, a4, a5, a6) {
    try {
      return Module['dynCall_iiiiji'](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiji(index, a1, a2, a3, a4, a5) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5);
  }
  function invoke_ii(index, a1) {
    try {
      return Module['dynCall_ii'](index, a1);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_ii(index, a1) {
    return Runtime.functionPointers[index](a1);
  }
  function invoke_ij(index, a1, a2) {
    try {
      return Module['dynCall_ij'](index, a1, a2);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_ij(index, a1) {
    return Runtime.functionPointers[index](a1);
  }
  function invoke_iidi(index, a1, a2, a3) {
    try {
      return Module['dynCall_iidi'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iidi(index, a1, a2, a3) {
    return Runtime.functionPointers[index](a1, a2, a3);
  }
  function invoke_id(index, a1) {
    try {
      return Module['dynCall_id'](index, a1);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_id(index, a1) {
    return Runtime.functionPointers[index](a1);
  }
  function invoke_jiji(index, a1, a2, a3, a4) {
    try {
      return Module['dynCall_jiji'](index, a1, a2, a3, a4);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_jiji(index, a1, a2, a3) {
    return Runtime.functionPointers[index](a1, a2, a3);
  }
  function invoke_iiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) {
    try {
      return Module['dynCall_iiiiiiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11);
  }
  function invoke_vidi(index, a1, a2, a3) {
    try {
      Module['dynCall_vidi'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_vidi(index, a1, a2, a3) {
    Runtime.functionPointers[index](a1, a2, a3);
  }
  function invoke_ijii(index, a1, a2, a3, a4) {
    try {
      return Module['dynCall_ijii'](index, a1, a2, a3, a4);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_ijii(index, a1, a2, a3) {
    return Runtime.functionPointers[index](a1, a2, a3);
  }
  function invoke_iiii(index, a1, a2, a3) {
    try {
      return Module['dynCall_iiii'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiii(index, a1, a2, a3) {
    return Runtime.functionPointers[index](a1, a2, a3);
  }
  function invoke_idii(index, a1, a2, a3) {
    try {
      return Module['dynCall_idii'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_idii(index, a1, a2, a3) {
    return Runtime.functionPointers[index](a1, a2, a3);
  }
  function invoke_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    try {
      Module['dynCall_viiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6, a7, a8);
  }
  function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
      Module['dynCall_viiiiii'](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6);
  }
  function invoke_ddd(index, a1, a2) {
    try {
      return Module['dynCall_ddd'](index, a1, a2);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_ddd(index, a1, a2) {
    return Runtime.functionPointers[index](a1, a2);
  }
  function invoke_di(index, a1) {
    try {
      return Module['dynCall_di'](index, a1);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_di(index, a1) {
    return Runtime.functionPointers[index](a1);
  }
  function invoke_iiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {
    try {
      return Module['dynCall_iiiiiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);
  }
  function invoke_dd(index, a1) {
    try {
      return Module['dynCall_dd'](index, a1);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_dd(index, a1) {
    return Runtime.functionPointers[index](a1);
  }
  function invoke_idiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
      return Module['dynCall_idiiiii'](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_idiiiii(index, a1, a2, a3, a4, a5, a6) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6);
  }
  function invoke_ji(index, a1) {
    try {
      return Module['dynCall_ji'](index, a1);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_ji(index, a1) {
    return Runtime.functionPointers[index](a1);
  }
  function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    try {
      Module['dynCall_viiiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6, a7, a8, a9);
  }
  function invoke_iii(index, a1, a2) {
    try {
      return Module['dynCall_iii'](index, a1, a2);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iii(index, a1, a2) {
    return Runtime.functionPointers[index](a1, a2);
  }
  function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
    try {
      return Module['dynCall_iiiiii'](index, a1, a2, a3, a4, a5);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiii(index, a1, a2, a3, a4, a5) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5);
  }
  function invoke_iij(index, a1, a2, a3) {
    try {
      return Module['dynCall_iij'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iij(index, a1, a2) {
    return Runtime.functionPointers[index](a1, a2);
  }
  function invoke_d(index) {
    try {
      return Module['dynCall_d'](index);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_d(index) {
    return Runtime.functionPointers[index]();
  }
  function invoke_i(index) {
    try {
      return Module['dynCall_i'](index);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_i(index) {
    return Runtime.functionPointers[index]();
  }
  function invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    try {
      return Module['dynCall_iiiiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6, a7, a8, a9);
  }
  function invoke_viii(index, a1, a2, a3) {
    try {
      Module['dynCall_viii'](index, a1, a2, a3);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_viii(index, a1, a2, a3) {
    Runtime.functionPointers[index](a1, a2, a3);
  }
  function invoke_v(index) {
    try {
      Module['dynCall_v'](index);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_v(index) {
    Runtime.functionPointers[index]();
  }
  function invoke_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    try {
      return Module['dynCall_iiiiiiiii'](index, a1, a2, a3, a4, a5, a6, a7, a8);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    return Runtime.functionPointers[index](a1, a2, a3, a4, a5, a6, a7, a8);
  }
  function invoke_iiiii(index, a1, a2, a3, a4) {
    try {
      return Module['dynCall_iiiii'](index, a1, a2, a3, a4);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_iiiii(index, a1, a2, a3, a4) {
    return Runtime.functionPointers[index](a1, a2, a3, a4);
  }
  function invoke_viiii(index, a1, a2, a3, a4) {
    try {
      Module['dynCall_viiii'](index, a1, a2, a3, a4);
    } catch (e) {
      if (typeof e !== 'number' && e !== 'longjmp') throw e;
      Module['setThrew'](1, 0);
    }
  }
  function jsCall_viiii(index, a1, a2, a3, a4) {
    Runtime.functionPointers[index](a1, a2, a3, a4);
  }
  Module.asmGlobalArg = {
    Math: Math,
    Int8Array: Int8Array,
    Int16Array: Int16Array,
    Int32Array: Int32Array,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Float32Array: Float32Array,
    Float64Array: Float64Array,
    NaN: NaN,
    Infinity: Infinity,
  };
  Module.asmLibraryArg = {
    abort: abort,
    assert: assert,
    enlargeMemory: enlargeMemory,
    getTotalMemory: getTotalMemory,
    abortOnCannotGrowMemory: abortOnCannotGrowMemory,
    invoke_iiiiiiii: invoke_iiiiiiii,
    jsCall_iiiiiiii: jsCall_iiiiiiii,
    invoke_jijii: invoke_jijii,
    jsCall_jijii: jsCall_jijii,
    invoke_vid: invoke_vid,
    jsCall_vid: jsCall_vid,
    invoke_viiiii: invoke_viiiii,
    jsCall_viiiii: jsCall_viiiii,
    invoke_vij: invoke_vij,
    jsCall_vij: jsCall_vij,
    invoke_vi: invoke_vi,
    jsCall_vi: jsCall_vi,
    invoke_vii: invoke_vii,
    jsCall_vii: jsCall_vii,
    invoke_iiiiiii: invoke_iiiiiii,
    jsCall_iiiiiii: jsCall_iiiiiii,
    invoke_iiiiji: invoke_iiiiji,
    jsCall_iiiiji: jsCall_iiiiji,
    invoke_ii: invoke_ii,
    jsCall_ii: jsCall_ii,
    invoke_ij: invoke_ij,
    jsCall_ij: jsCall_ij,
    invoke_iidi: invoke_iidi,
    jsCall_iidi: jsCall_iidi,
    invoke_id: invoke_id,
    jsCall_id: jsCall_id,
    invoke_jiji: invoke_jiji,
    jsCall_jiji: jsCall_jiji,
    invoke_iiiiiiiiiiii: invoke_iiiiiiiiiiii,
    jsCall_iiiiiiiiiiii: jsCall_iiiiiiiiiiii,
    invoke_vidi: invoke_vidi,
    jsCall_vidi: jsCall_vidi,
    invoke_ijii: invoke_ijii,
    jsCall_ijii: jsCall_ijii,
    invoke_iiii: invoke_iiii,
    jsCall_iiii: jsCall_iiii,
    invoke_idii: invoke_idii,
    jsCall_idii: jsCall_idii,
    invoke_viiiiiiii: invoke_viiiiiiii,
    jsCall_viiiiiiii: jsCall_viiiiiiii,
    invoke_viiiiii: invoke_viiiiii,
    jsCall_viiiiii: jsCall_viiiiii,
    invoke_ddd: invoke_ddd,
    jsCall_ddd: jsCall_ddd,
    invoke_di: invoke_di,
    jsCall_di: jsCall_di,
    invoke_iiiiiiiiiii: invoke_iiiiiiiiiii,
    jsCall_iiiiiiiiiii: jsCall_iiiiiiiiiii,
    invoke_dd: invoke_dd,
    jsCall_dd: jsCall_dd,
    invoke_idiiiii: invoke_idiiiii,
    jsCall_idiiiii: jsCall_idiiiii,
    invoke_ji: invoke_ji,
    jsCall_ji: jsCall_ji,
    invoke_viiiiiiiii: invoke_viiiiiiiii,
    jsCall_viiiiiiiii: jsCall_viiiiiiiii,
    invoke_iii: invoke_iii,
    jsCall_iii: jsCall_iii,
    invoke_iiiiii: invoke_iiiiii,
    jsCall_iiiiii: jsCall_iiiiii,
    invoke_iij: invoke_iij,
    jsCall_iij: jsCall_iij,
    invoke_d: invoke_d,
    jsCall_d: jsCall_d,
    invoke_i: invoke_i,
    jsCall_i: jsCall_i,
    invoke_iiiiiiiiii: invoke_iiiiiiiiii,
    jsCall_iiiiiiiiii: jsCall_iiiiiiiiii,
    invoke_viii: invoke_viii,
    jsCall_viii: jsCall_viii,
    invoke_v: invoke_v,
    jsCall_v: jsCall_v,
    invoke_iiiiiiiii: invoke_iiiiiiiii,
    jsCall_iiiiiiiii: jsCall_iiiiiiiii,
    invoke_iiiii: invoke_iiiii,
    jsCall_iiiii: jsCall_iiiii,
    invoke_viiii: invoke_viiii,
    jsCall_viiii: jsCall_viiii,
    ___syscall221: ___syscall221,
    ___syscall220: ___syscall220,
    __inet_pton4_raw: __inet_pton4_raw,
    _emscripten_get_now_is_monotonic: _emscripten_get_now_is_monotonic,
    _emscripten_asm_const_iiiii: _emscripten_asm_const_iiiii,
    _getgrnam: _getgrnam,
    _localtime_r: _localtime_r,
    ___syscall122: ___syscall122,
    ___syscall63: ___syscall63,
    ___syscall60: ___syscall60,
    __inet_ntop4_raw: __inet_ntop4_raw,
    ___syscall40: ___syscall40,
    _execvp: _execvp,
    ___syscall42: ___syscall42,
    ___syscall183: ___syscall183,
    _gmtime_r: _gmtime_r,
    ___setErrNo: ___setErrNo,
    _fork: _fork,
    __inet_pton6_raw: __inet_pton6_raw,
    ___syscall20: ___syscall20,
    _gai_strerror: _gai_strerror,
    __Exit: __Exit,
    __inet_ntop6_raw: __inet_ntop6_raw,
    ___buildEnvironment: ___buildEnvironment,
    __read_sockaddr: __read_sockaddr,
    ___syscall102: ___syscall102,
    _clock_gettime: _clock_gettime,
    _emscripten_set_main_loop: _emscripten_set_main_loop,
    ___syscall83: ___syscall83,
    _signal: _signal,
    _wait: _wait,
    _emscripten_set_main_loop_timing: _emscripten_set_main_loop_timing,
    ___syscall38: ___syscall38,
    _getpwnam: _getpwnam,
    ___syscall197: ___syscall197,
    _tzset: _tzset,
    _emscripten_memcpy_big: _emscripten_memcpy_big,
    ___syscall194: ___syscall194,
    ___syscall199: ___syscall199,
    _utime: _utime,
    _execl: _execl,
    _mktime: _mktime,
    ___syscall202: ___syscall202,
    ___unlock: ___unlock,
    ___syscall195: ___syscall195,
    ___syscall91: ___syscall91,
    _gethostbyaddr: _gethostbyaddr,
    _exit: _exit,
    ___syscall212: ___syscall212,
    _abort: _abort,
    _getenv: _getenv,
    ___syscall51: ___syscall51,
    ___map_file: ___map_file,
    ___syscall33: ___syscall33,
    ___syscall54: ___syscall54,
    ___syscall85: ___syscall85,
    _llvm_pow_f64: _llvm_pow_f64,
    ___syscall15: ___syscall15,
    __write_sockaddr: __write_sockaddr,
    ___syscall39: ___syscall39,
    ___syscall12: ___syscall12,
    _emscripten_get_now: _emscripten_get_now,
    ___syscall10: ___syscall10,
    ___syscall9: ___syscall9,
    _getpwuid: _getpwuid,
    ___syscall14: ___syscall14,
    _gethostbyname: _gethostbyname,
    ___syscall3: ___syscall3,
    ___lock: ___lock,
    ___syscall6: ___syscall6,
    ___syscall5: ___syscall5,
    ___clock_gettime: ___clock_gettime,
    _getaddrinfo: _getaddrinfo,
    _time: _time,
    _gettimeofday: _gettimeofday,
    ___syscall201: ___syscall201,
    ___syscall4: ___syscall4,
    ___syscall140: ___syscall140,
    ___syscall196: ___syscall196,
    ___syscall142: ___syscall142,
    _getgrgid: _getgrgid,
    ___syscall145: ___syscall145,
    ___syscall146: ___syscall146,
    _waitpid: _waitpid,
    DYNAMICTOP_PTR: DYNAMICTOP_PTR,
    tempDoublePtr: tempDoublePtr,
    ABORT: ABORT,
    STACKTOP: STACKTOP,
    STACK_MAX: STACK_MAX,
    _environ: _environ,
  };
  var asm = Module['asm'](Module.asmGlobalArg, Module.asmLibraryArg, buffer);
  Module['asm'] = asm;
  var _llvm_bswap_i32 = (Module['_llvm_bswap_i32'] = function () {
    return Module['asm']['_llvm_bswap_i32'].apply(null, arguments);
  });
  var _main = (Module['_main'] = function () {
    return Module['asm']['_main'].apply(null, arguments);
  });
  var _Tcl_GetStringResult = (Module['_Tcl_GetStringResult'] = function () {
    return Module['asm']['_Tcl_GetStringResult'].apply(null, arguments);
  });
  var setThrew = (Module['setThrew'] = function () {
    return Module['asm']['setThrew'].apply(null, arguments);
  });
  var _fflush = (Module['_fflush'] = function () {
    return Module['asm']['_fflush'].apply(null, arguments);
  });
  var setTempRet0 = (Module['setTempRet0'] = function () {
    return Module['asm']['setTempRet0'].apply(null, arguments);
  });
  var _Wacl_GetInterp = (Module['_Wacl_GetInterp'] = function () {
    return Module['asm']['_Wacl_GetInterp'].apply(null, arguments);
  });
  var _memset = (Module['_memset'] = function () {
    return Module['asm']['_memset'].apply(null, arguments);
  });
  var _sbrk = (Module['_sbrk'] = function () {
    return Module['asm']['_sbrk'].apply(null, arguments);
  });
  var _memcpy = (Module['_memcpy'] = function () {
    return Module['asm']['_memcpy'].apply(null, arguments);
  });
  var ___errno_location = (Module['___errno_location'] = function () {
    return Module['asm']['___errno_location'].apply(null, arguments);
  });
  var stackAlloc = (Module['stackAlloc'] = function () {
    return Module['asm']['stackAlloc'].apply(null, arguments);
  });
  var getTempRet0 = (Module['getTempRet0'] = function () {
    return Module['asm']['getTempRet0'].apply(null, arguments);
  });
  var _ntohs = (Module['_ntohs'] = function () {
    return Module['asm']['_ntohs'].apply(null, arguments);
  });
  var _htonl = (Module['_htonl'] = function () {
    return Module['asm']['_htonl'].apply(null, arguments);
  });
  var _Tcl_Eval = (Module['_Tcl_Eval'] = function () {
    return Module['asm']['_Tcl_Eval'].apply(null, arguments);
  });
  var _emscripten_get_global_libc = (Module['_emscripten_get_global_libc'] = function () {
    return Module['asm']['_emscripten_get_global_libc'].apply(null, arguments);
  });
  var _htons = (Module['_htons'] = function () {
    return Module['asm']['_htons'].apply(null, arguments);
  });
  var stackSave = (Module['stackSave'] = function () {
    return Module['asm']['stackSave'].apply(null, arguments);
  });
  var _llvm_bswap_i16 = (Module['_llvm_bswap_i16'] = function () {
    return Module['asm']['_llvm_bswap_i16'].apply(null, arguments);
  });
  var _free = (Module['_free'] = function () {
    return Module['asm']['_free'].apply(null, arguments);
  });
  var runPostSets = (Module['runPostSets'] = function () {
    return Module['asm']['runPostSets'].apply(null, arguments);
  });
  var establishStackSpace = (Module['establishStackSpace'] = function () {
    return Module['asm']['establishStackSpace'].apply(null, arguments);
  });
  var _memmove = (Module['_memmove'] = function () {
    return Module['asm']['_memmove'].apply(null, arguments);
  });
  var stackRestore = (Module['stackRestore'] = function () {
    return Module['asm']['stackRestore'].apply(null, arguments);
  });
  var _malloc = (Module['_malloc'] = function () {
    return Module['asm']['_malloc'].apply(null, arguments);
  });
  var dynCall_iiiiiiii = (Module['dynCall_iiiiiiii'] = function () {
    return Module['asm']['dynCall_iiiiiiii'].apply(null, arguments);
  });
  var dynCall_jijii = (Module['dynCall_jijii'] = function () {
    return Module['asm']['dynCall_jijii'].apply(null, arguments);
  });
  var dynCall_vid = (Module['dynCall_vid'] = function () {
    return Module['asm']['dynCall_vid'].apply(null, arguments);
  });
  var dynCall_viiiii = (Module['dynCall_viiiii'] = function () {
    return Module['asm']['dynCall_viiiii'].apply(null, arguments);
  });
  var dynCall_vij = (Module['dynCall_vij'] = function () {
    return Module['asm']['dynCall_vij'].apply(null, arguments);
  });
  var dynCall_vi = (Module['dynCall_vi'] = function () {
    return Module['asm']['dynCall_vi'].apply(null, arguments);
  });
  var dynCall_vii = (Module['dynCall_vii'] = function () {
    return Module['asm']['dynCall_vii'].apply(null, arguments);
  });
  var dynCall_iiiiiii = (Module['dynCall_iiiiiii'] = function () {
    return Module['asm']['dynCall_iiiiiii'].apply(null, arguments);
  });
  var dynCall_iiiiji = (Module['dynCall_iiiiji'] = function () {
    return Module['asm']['dynCall_iiiiji'].apply(null, arguments);
  });
  var dynCall_ii = (Module['dynCall_ii'] = function () {
    return Module['asm']['dynCall_ii'].apply(null, arguments);
  });
  var dynCall_ij = (Module['dynCall_ij'] = function () {
    return Module['asm']['dynCall_ij'].apply(null, arguments);
  });
  var dynCall_iidi = (Module['dynCall_iidi'] = function () {
    return Module['asm']['dynCall_iidi'].apply(null, arguments);
  });
  var dynCall_id = (Module['dynCall_id'] = function () {
    return Module['asm']['dynCall_id'].apply(null, arguments);
  });
  var dynCall_jiji = (Module['dynCall_jiji'] = function () {
    return Module['asm']['dynCall_jiji'].apply(null, arguments);
  });
  var dynCall_iiiiiiiiiiii = (Module['dynCall_iiiiiiiiiiii'] = function () {
    return Module['asm']['dynCall_iiiiiiiiiiii'].apply(null, arguments);
  });
  var dynCall_vidi = (Module['dynCall_vidi'] = function () {
    return Module['asm']['dynCall_vidi'].apply(null, arguments);
  });
  var dynCall_ijii = (Module['dynCall_ijii'] = function () {
    return Module['asm']['dynCall_ijii'].apply(null, arguments);
  });
  var dynCall_iiii = (Module['dynCall_iiii'] = function () {
    return Module['asm']['dynCall_iiii'].apply(null, arguments);
  });
  var dynCall_idii = (Module['dynCall_idii'] = function () {
    return Module['asm']['dynCall_idii'].apply(null, arguments);
  });
  var dynCall_viiiiiiii = (Module['dynCall_viiiiiiii'] = function () {
    return Module['asm']['dynCall_viiiiiiii'].apply(null, arguments);
  });
  var dynCall_viiiiii = (Module['dynCall_viiiiii'] = function () {
    return Module['asm']['dynCall_viiiiii'].apply(null, arguments);
  });
  var dynCall_ddd = (Module['dynCall_ddd'] = function () {
    return Module['asm']['dynCall_ddd'].apply(null, arguments);
  });
  var dynCall_di = (Module['dynCall_di'] = function () {
    return Module['asm']['dynCall_di'].apply(null, arguments);
  });
  var dynCall_iiiiiiiiiii = (Module['dynCall_iiiiiiiiiii'] = function () {
    return Module['asm']['dynCall_iiiiiiiiiii'].apply(null, arguments);
  });
  var dynCall_dd = (Module['dynCall_dd'] = function () {
    return Module['asm']['dynCall_dd'].apply(null, arguments);
  });
  var dynCall_idiiiii = (Module['dynCall_idiiiii'] = function () {
    return Module['asm']['dynCall_idiiiii'].apply(null, arguments);
  });
  var dynCall_ji = (Module['dynCall_ji'] = function () {
    return Module['asm']['dynCall_ji'].apply(null, arguments);
  });
  var dynCall_viiiiiiiii = (Module['dynCall_viiiiiiiii'] = function () {
    return Module['asm']['dynCall_viiiiiiiii'].apply(null, arguments);
  });
  var dynCall_iii = (Module['dynCall_iii'] = function () {
    return Module['asm']['dynCall_iii'].apply(null, arguments);
  });
  var dynCall_iiiiii = (Module['dynCall_iiiiii'] = function () {
    return Module['asm']['dynCall_iiiiii'].apply(null, arguments);
  });
  var dynCall_iij = (Module['dynCall_iij'] = function () {
    return Module['asm']['dynCall_iij'].apply(null, arguments);
  });
  var dynCall_d = (Module['dynCall_d'] = function () {
    return Module['asm']['dynCall_d'].apply(null, arguments);
  });
  var dynCall_i = (Module['dynCall_i'] = function () {
    return Module['asm']['dynCall_i'].apply(null, arguments);
  });
  var dynCall_iiiiiiiiii = (Module['dynCall_iiiiiiiiii'] = function () {
    return Module['asm']['dynCall_iiiiiiiiii'].apply(null, arguments);
  });
  var dynCall_viii = (Module['dynCall_viii'] = function () {
    return Module['asm']['dynCall_viii'].apply(null, arguments);
  });
  var dynCall_v = (Module['dynCall_v'] = function () {
    return Module['asm']['dynCall_v'].apply(null, arguments);
  });
  var dynCall_iiiiiiiii = (Module['dynCall_iiiiiiiii'] = function () {
    return Module['asm']['dynCall_iiiiiiiii'].apply(null, arguments);
  });
  var dynCall_iiiii = (Module['dynCall_iiiii'] = function () {
    return Module['asm']['dynCall_iiiii'].apply(null, arguments);
  });
  var dynCall_viiii = (Module['dynCall_viiii'] = function () {
    return Module['asm']['dynCall_viiii'].apply(null, arguments);
  });
  Runtime.stackAlloc = Module['stackAlloc'];
  Runtime.stackSave = Module['stackSave'];
  Runtime.stackRestore = Module['stackRestore'];
  Runtime.establishStackSpace = Module['establishStackSpace'];
  Runtime.setTempRet0 = Module['setTempRet0'];
  Runtime.getTempRet0 = Module['getTempRet0'];
  Module['asm'] = asm;
  if (memoryInitializer) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
    if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
      var data = Module['readBinary'](memoryInitializer);
      HEAPU8.set(data, Runtime.GLOBAL_BASE);
    } else {
      addRunDependency('memory initializer');
      var applyMemoryInitializer = function (data) {
        if (data.byteLength) data = new Uint8Array(data);
        HEAPU8.set(data, Runtime.GLOBAL_BASE);
        if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
        removeRunDependency('memory initializer');
      };
      function doBrowserLoad() {
        Module['readAsync'](memoryInitializer, applyMemoryInitializer, function () {
          throw 'could not load memory initializer ' + memoryInitializer;
        });
      }
      if (Module['memoryInitializerRequest']) {
        function useRequest() {
          var request = Module['memoryInitializerRequest'];
          if (request.status !== 200 && request.status !== 0) {
            console.warn(
              'a problem seems to have happened with Module.memoryInitializerRequest, status: ' +
                request.status +
                ', retrying ' +
                memoryInitializer,
            );
            doBrowserLoad();
            return;
          }
          applyMemoryInitializer(request.response);
        }
        if (Module['memoryInitializerRequest'].response) {
          setTimeout(useRequest, 0);
        } else {
          Module['memoryInitializerRequest'].addEventListener('load', useRequest);
        }
      } else {
        doBrowserLoad();
      }
    }
  }
  function ExitStatus(status) {
    this.name = 'ExitStatus';
    this.message = 'Program terminated with exit(' + status + ')';
    this.status = status;
  }
  ExitStatus.prototype = new Error();
  ExitStatus.prototype.constructor = ExitStatus;
  var initialStackTop;
  var preloadStartTime = null;
  var calledMain = false;
  dependenciesFulfilled = function runCaller() {
    if (!Module['calledRun']) run();
    if (!Module['calledRun']) dependenciesFulfilled = runCaller;
  };
  Module['callMain'] = Module.callMain = function callMain(args) {
    args = args || [];
    ensureInitRuntime();
    var argc = args.length + 1;
    function pad() {
      for (var i = 0; i < 4 - 1; i++) {
        argv.push(0);
      }
    }
    var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL)];
    pad();
    for (var i = 0; i < argc - 1; i = i + 1) {
      argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
      pad();
    }
    argv.push(0);
    argv = allocate(argv, 'i32', ALLOC_NORMAL);
    try {
      var ret = Module['_main'](argc, argv, 0);
      exit(ret, true);
    } catch (e) {
      if (e instanceof ExitStatus) {
        return;
      } else if (e == 'SimulateInfiniteLoop') {
        Module['noExitRuntime'] = true;
        return;
      } else {
        var toLog = e;
        if (e && typeof e === 'object' && e.stack) {
          toLog = [e, e.stack];
        }
        Module.printErr('exception thrown: ' + toLog);
        Module['quit'](1, e);
      }
    } finally {
      calledMain = true;
    }
  };
  function run(args) {
    args = args || Module['arguments'];
    if (preloadStartTime === null) preloadStartTime = Date.now();
    if (runDependencies > 0) {
      return;
    }
    preRun();
    if (runDependencies > 0) return;
    if (Module['calledRun']) return;
    function doRun() {
      if (Module['calledRun']) return;
      Module['calledRun'] = true;
      if (ABORT) return;
      ensureInitRuntime();
      preMain();
      if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();
      if (Module['_main'] && shouldRunNow) Module['callMain'](args);
      postRun();
    }
    if (Module['setStatus']) {
      Module['setStatus']('Running...');
      setTimeout(function () {
        setTimeout(function () {
          Module['setStatus']('');
        }, 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  Module['run'] = Module.run = run;
  function exit(status, implicit) {
    if (implicit && Module['noExitRuntime']) {
      return;
    }
    if (Module['noExitRuntime']) {
    } else {
      ABORT = true;
      EXITSTATUS = status;
      STACKTOP = initialStackTop;
      exitRuntime();
      if (Module['onExit']) Module['onExit'](status);
    }
    if (ENVIRONMENT_IS_NODE) {
      process['exit'](status);
    }
    Module['quit'](status, new ExitStatus(status));
  }
  Module['exit'] = Module.exit = exit;
  var abortDecorators = [];
  function abort(what) {
    if (what !== undefined) {
      Module.print(what);
      Module.printErr(what);
      what = JSON.stringify(what);
    } else {
      what = '';
    }
    ABORT = true;
    EXITSTATUS = 1;
    var extra =
      '\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.';
    var output = 'abort(' + what + ') at ' + stackTrace() + extra;
    if (abortDecorators) {
      abortDecorators.forEach(function (decorator) {
        output = decorator(output, what);
      });
    }
    throw output;
  }
  Module['abort'] = Module.abort = abort;
  if (Module['preInit']) {
    if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
    while (Module['preInit'].length > 0) {
      Module['preInit'].pop()();
    }
  }
  var shouldRunNow = true;
  if (Module['noInitialRun']) {
    shouldRunNow = false;
  }
  run();
  delete window.Module;
  return {
    onReady: function (callback) {
      if (Module['calledRun'] != undefined && Module['calledRun']) {
        callback(_Result);
      } else {
        _OnReadyCb = callback;
      }
    },
  };
})();
