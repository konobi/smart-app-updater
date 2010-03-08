CP = cp
CP_R = cp -R
MV = mv
NOOP = $(SHELL) -c true
RM_RF = rm -rf
MKPATH = mkdir -p
GIT = git
CD = cd
PYTHON = python
PERL = perl
LN_S = ln -s
LN_SF = ln -sf
TOUCH = touch
PLATFORM ?= $(shell uname -s)

ifeq ($(PLATFORM),SunOS)
    TAR = gtar
else
    TAR = tar
endif

TOP ?= $(shell pwd)
NAME ?= $(strip $(shell perl -ne '/var AGENT_NAME.+?([\w\-]+)/ && print $$1' app.js))
VERSION ?= $(strip $(shell perl -ne '/var VERSION.+?(\d+\.\d+)/ && print $$1' app.js))
PREFIX ?= /opt/local/agents/$(NAME)

all: build

checkout: ./.UPTODATE
./.UPTODATE: 
	$(GIT) submodule init
	$(GIT) submodule update
	$(TOUCH) node/.UPTODATE
	$(TOUCH) amqp/.UPTODATE
	$(TOUCH) ./.UPTODATE

build: build_node build_amqp

build_node: checkout node/.BUILT
node/.BUILT:
	$(CD) node; $(PYTHON) tools/waf-light configure --prefix=$(PREFIX)/local/
	$(CD) node; $(PYTHON) tools/waf-light build
	$(TOUCH) node/.BUILT

build_amqp: checkout build_node amqp/.BUILT
amqp/.BUILT:
	$(TOUCH) amqp/.BUILT

clean: clean_node clean_libs
	-$(RM_RF) ./.UPTODATE

clean_node:
	-$(RM_RF) node

clean_libs:
	-$(RM_RF) amqp

install: build install_env install_node install_amqp
	$(CP) app.js $(PREFIX)/app.js
	$(CP) helper.js $(PREFIX)/helper.js
	$(PERL) -pi -e 's{^#!.+$$}{#!$(PREFIX)/local/bin/node}' $(PREFIX)/app.js

install_env:
	$(MKPATH) $(PREFIX)

install_node:
	$(CD) node; $(PYTHON) tools/waf-light install

install_amqp: install_node
	$(CP_R) amqp $(PREFIX)/local/lib/node/libraries/

