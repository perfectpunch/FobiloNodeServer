@echo off
echo.

set NodePackagesPath=D:\NodeJS\FobiloNodeServer

set Path=%NodePackagesPath%\node_modules\.bin;%PATH%
set Path=%NodePackagesPath%;%PATH%

set NODE_PATH=%NodePackagesPath%\node_modules;%NODE_PATH%
set NODE_ENV=production

node D:\NodeJS\FobiloNodeServer\server.js