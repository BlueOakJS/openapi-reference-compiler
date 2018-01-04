#!/usr/bin/env node

var cmdr = require('commander'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    parser = require('swagger-parser'),
    tmp = require('tmp'),
    isWindows = /^win/.test(process.platform);

cmdr.version('1.0.0')
    .description('Merge OpenAPI definitions into a single file resolving references')
    .option('-i, --inputFile <inputFile>', 'main OpenAPI file')
    .option('-o, --outputFile <outputFile>', 'where output should be written')
    .option('-r, --refDirs <refDirs>', 'list of reference directories separated by \':\'')
    .option('-v, --verbose', 'verbose output')
    .option('-t, --test', 'just testing')
    .parse(process.argv);

if (!cmdr.inputFile) {
    showHelp('You must specify an input file.');
}
if (!cmdr.outputFile) {
    showHelp('You must specify an output file.');
}

function showHelp(msg) {
    cmdr.outputHelp();
    console.log(msg);
    process.exit();
}

var fullPath = path.resolve(cmdr.inputFile),
    refcOutfile = tmp.fileSync({ dir: path.dirname(fullPath)});

var opts = {
    swaggerDir: path.join(path.dirname(fullPath)),
    baseSpecFile: path.basename(fullPath),
    refDirs: [''],
    refcOutfile: refcOutfile.name,
    outFile: path.resolve(cmdr.outputFile)
};

if (cmdr.refDirs) {
    opts.refDirs = opts.refDirs.concat(cmdr.refDirs.split(':'));
    for (var i = 1; i < opts.refDirs.length; i++) {
        var fullDir = path.resolve(opts.refDirs[i]);
        try {
            var stats = fs.statSync(opts.refDirs[i]);
            if (!stats.isDirectory()) {
                console.log('Reference directory \'' + opts.refDirs[i] + '\' is not a directory.');
                process.exit();
            }
        } catch (err) {
            console.log('Reference directory \'' + opts.refDirs[i] + '\' does not exist.');
            process.exit();
        }
        opts.refDirs[i] = path.relative(opts.swaggerDir, fullDir);
    }
}

var outDir = path.dirname(opts.outFile);
if (cmdr.test) {
    console.log('opts: ', JSON.stringify(opts, null, 2));
    console.log('outDir:', outDir);
} else {
    if (cmdr.verbose) {
        console.log('Compiling references...');
        console.log('ref compiler temp file:', opts.refcOutfile);
    }

    compileSpec(opts);
    
    parser.bundle(opts.refcOutfile)
        .then(function (swaggerJSON) {
            mkdirp.sync(outDir);
            var fd = fs.openSync(opts.outFile, 'w');
            fs.writeSync(fd, JSON.stringify(swaggerJSON, null, 4));
            fs.closeSync(fd);
            console.log('JSON for OpenAPI written to', opts.outFile);
        });
}

function compileSpec(swaggerCfg) {
    if (/.+\.(yaml)$/i.test(swaggerCfg.baseSpecFile)) {
        compileYAMLReferences(swaggerCfg.swaggerDir, swaggerCfg.baseSpecFile, swaggerCfg.refDirs, swaggerCfg.refcOutfile);
    } else if (/.+\.(json)$/i.test(swaggerCfg.baseSpecFile)) {
        compileJSONReferences(swaggerCfg.swaggerDir, swaggerCfg.baseSpecFile, swaggerCfg.refDirs, swaggerCfg.refcOutfile);
    } else {
        console.log('Unknown file extension for base spec file', swaggerCfg.baseSpecFile);
    }
}

/**
 * @param  {string} baseSpecFile - file name of the base spec
 *  e.g. 'app-api-mysf-v2.yaml'
 * @param  {string[]} refDirs - list of directories with references to include
 *  e.g. ['v2/public', 'v2/private/mysf']
 */
function compileYAMLReferences(swaggerDir, baseSpecFile, refDirs, outFile) {
    if (cmdr.verbose) {        
        console.log('swaggerDir:', swaggerDir);
        console.log('baseSpecFile:', baseSpecFile);
        console.log('refDirs:', refDirs);
    }
    var baseSpecFilePath = path.join(swaggerDir, baseSpecFile);
    var resourcesChunk = '';
    var fileData = fs.readFileSync(baseSpecFilePath, 'utf8');
    var fileDataPrefix = fileData.split('### ref-compiler: BEGIN')[0];
    resourcesChunk += '### ref-compiler: BEGIN\n';
    var directoryTypes = ['definitions', 'responses', 'parameters'];

    //For each directory type
    directoryTypes.forEach(function (directoryType) {
        var items = [];

        //for each input directory
        refDirs.forEach(function (indir) {
            var files, itemName, itemPath, relativePath;
            var inDirectory = path.join(swaggerDir, indir, directoryType);

            //if directory exists, read each file name
            try {
                files = fs.readdirSync(inDirectory);
                //get the file names and save all of type .yaml or .json
                files.forEach(function (file) {
                    if (/.+\.(yaml)$/i.test(file)) {
                        items.push(file);
                    }
                });
                if (items.length > 0) {
                    //get the relative path between the output directory and the input directory
                    relativePath = path.relative(swaggerDir, inDirectory);
                    if (resourcesChunk.indexOf(directoryType) === -1) {
                        resourcesChunk += directoryType + ':\n';
                    }
                    //write each item to the output file
                    items.forEach(function (item) {
                        itemName = _getItemName(item);
                        itemPath = _getItemPath(relativePath, item);
                        resourcesChunk += '  ' + itemName + ':\n  ' +
                            '  $ref: ' + '\'' + itemPath + '\'' + '\n';
                    });
                    items = [];
                }
            }
            catch (e) {
                //ENOENT errors should be suppressed because not all directory types are required
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
        });
    });

    var writeData = fileDataPrefix + resourcesChunk;
    var fd = fs.openSync(outFile, 'w');
    fs.writeSync(fd, writeData);
    fs.closeSync(fd);
}

/**
 * @param  {string} baseSpecFile - file name of the base spec
 *  e.g. 'app-api-mysf-v2.json'
 * @param  {string[]} refDirs - list of directories with references to include
 *  e.g. ['v2/public', 'v2/private/mysf']
 */
function compileJSONReferences(swaggerDir, baseSpecFile, refDirs, outFile) {
    var baseSpecFilePath = path.join(swaggerDir, baseSpecFile);
    var fileData = fs.readFileSync(baseSpecFilePath, 'utf8');
    var jsonData = JSON.parse(fileData);
    var directoryTypes = ['definitions', 'responses', 'parameters'];

    //For each directory type
    directoryTypes.forEach(function (directoryType) {
        var items = [];
        if (!jsonData[directoryType]) {
            jsonData[directoryType] = {};
        }
        //for each input directory
        refDirs.forEach(function (indir) {
            var files, itemName, relativePath;
            var inDirectory = path.join(swaggerDir, indir, directoryType);

            //if directory exists, read each file name
            try {
                files = fs.readdirSync(inDirectory);
                //get the file names and save all of type .yaml or .json
                files.forEach(function (file) {
                    if (/.+\.(json)$/i.test(file)) {
                        items.push(file);
                    }
                });
                //get the relative path between the output directory and the input directory
                relativePath = path.relative(swaggerDir, inDirectory);
                // relativePath = relativePath !== '' ? relativePath + '/' : relativePath;
                //write each item to the output file
                items.forEach(function (item) {
                    itemName = _getItemName(item);
                    jsonData[directoryType][itemName] = {};
                    jsonData[directoryType][itemName].$ref = _getItemPath(relativePath, item);
                });
                items = [];
            }
            catch (e) {
                //ENOENT errors should be suppressed because not all directory types are required
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }
        });
    });
    var writeData = JSON.stringify(jsonData, null, 2);
    var fd = fs.openSync(outFile, 'w');
    fs.writeSync(fd, writeData);
    fs.closeSync(fd);
}

function _getItemName(item) {
    if (item.indexOf('.yaml') !== -1) {
        return item.split('.yaml')[0];
    } else {
        return item.split('.json')[0];
    }
}

function _getItemPath(relativePath, fileName) {
    var itemPath = path.join(relativePath, fileName);
    if (isWindows) {
        // we always want to write unix-style paths
        itemPath = itemPath.replace(/\\/g, '/');
    }
    return itemPath;
}
