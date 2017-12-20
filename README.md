# swagger-ref-compiler

> Compile a Swagger specification referencing local files into a single specification file

## Installation

```bash
npm i swagger-ref-compiler
```

## Features
- Compiles a main Swagger specification file that references other local files into a single Swagger JSON file
- Allows reference directories to be specified

## Usage
It is suggested to use this utility invoked by an NPM script so that the Swagger documentation can be compiled into a single specification file at build time.

```bash
  Usage: swaggerRefComp [options]

  Merge Swagger definitions into a single file resolving references


  Options:

    -V, --version                  output the version number
    -i, --inputFile <inputFile>    main Swagger API file
    -o, --outputFile <outputFile>  where output should be written
    -r, --refDirs <refDirs>        list of reference directories separated by ':'
    -t, --test                     just testing
    -h, --help                     output usage information
```

### Example command line invocation:
```bash
./node_modules/.bin/swaggerRefComp 
     -i ./swagger-source/api.yaml
     -o ./swagger/api.json
     -r ./node_modules/common-errors/swagger
```

### Example invocation via NPM:
#### In package.json, include:
```JSON
"scripts": {
    "swagger": "./node_modules/.bin/swaggerRefComp -i ./swagger-source/api.yaml -o ./swagger/api.json -r ./node_modules/common-errors/swagger"
}
```
#### Then invoke using:
```bash
npm run swagger
```

## Changelog

- 1.0.0: Initial release

## License

Copyright (c) 2017 PointSource, LLC.
MIT Licensed
