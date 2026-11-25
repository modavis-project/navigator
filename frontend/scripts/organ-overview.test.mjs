import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import test from "node:test";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {testUiLocale} from "./ui-locale-test-support.mjs";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/organOverview.tsx", import.meta.url), "utf8");
function compile(code, globals = {}, modules = {}) {
  const context = {exports: {}, require: id => id.endsWith(".css") ? {} : modules[id] || (id === "./uiLocale" ? {useUiLocale: testUiLocale} : require(id)), ...globals};
  vm.runInNewContext(ts.transpileModule(code, {compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText, context);
  return context;
}
const comparisonHelpers = compile(readFileSync(new URL("../src/sourceComparisonPresentation.ts", import.meta.url), "utf8")).exports;
const {OrganOverview} = compile(source, {}, {"./sourceComparisonPresentation": comparisonHelpers}).exports;
const organ = {
  mdvsId: "MDVS:ENTY:EXAMPLE", title: "Example organ", pageUrl: "/organs/EXAMPLE", canonicalUrl: "https://w3id.org/modavis/entity/EXAMPLE",
  quickFacts: [], sources: [{id:"s1",source:"src:First catalogue",url:"https://example.org/record"}],
  sourceSummary:{sourceRecords:14,collections:3},
  specificationDescriptions:[{id:"a1",kind:"main",periodLabel:"Undated listing"},{id:"a2",kind:"alternative",periodLabel:"Source account of 1862"}],
  publicProfile:{sections:[{key:"overview",items:[{label:"Source-reported stops",value:"64",source:"Catalogue account",evidenceSummary:"Attributed source summary"}]}]},
  documentedStateSummary:{yearLabel:"1862–2000",assertionCount:29},
  technicalEvidence:{descriptions:[{text:"Long source description",source:"First catalogue"}]},
  sourceComparisons:[{groups:[{groupId:"g1",status:"conflicting"},{groupId:"g2",status:"agreed"}]}],
  virtualInstruments:{linked:2},
};
const props = {
  organ, onOpenTab:()=>{}, facts:React.createElement("p",null,"Essential fact evidence"), factCount:1,
  moreFacts:React.createElement("p",null,"Additional fact evidence"), moreFactCount:2,
  accountContext:React.createElement("p",null,"All account totals and source links"),
  narrative:React.createElement("p",null,"Complete attributed narrative"),
  comparisons:React.createElement("p",null,"Complete conflicting source values"),
};
const render = (component, value) => renderToStaticMarkup(React.createElement(component, value));
const visibleSummary = html => html.slice(0,html.indexOf('<div class="overview-details"'));

test("an initial summary with no quick facts keeps useful source-qualified facts and primary routes visible", () => {
  const html = render(OrganOverview,{...props,facts:[],factCount:0});
  const visible = visibleSummary(html);
  assert.match(visible,/64<\/strong><span>source-reported stops/);
  assert.match(visible,/Catalogue account/);
  assert.match(visible,/Attributed source summary/);
  assert.match(visible,/2 specification descriptions · dates kept by account/);
  assert.match(visible,/1862–2000/);
  assert.match(visible,/Dates of recorded assertions/);
  assert.match(visible,/29 source event assertions/);
  assert.match(visible,/14 source records from 3 collections/);
  assert.match(visible,/do not establish the organ’s present condition/);
  assert.match(visible,/href="\/organs\/EXAMPLE\?tab=specification"/);
  assert.match(visible,/href="\/organs\/EXAMPLE\?tab=history"/);
  assert.match(visible,/href="https:\/\/example.org\/record"/);
  assert.match(visible,/2 linked virtual instruments/);
  assert.doesNotMatch(visible,/Documented facts/);
});

test("sparse metadata never invents zero totals, collection counts or a lack of history", () => {
  const sparse={...organ,sourceSummary:undefined,sourceCount:14,sources:[],publicProfile:undefined,documentedStateSummary:undefined,specificationDescriptions:[],technicalEvidence:undefined,sourceComparisons:[],virtualInstruments:undefined};
  const html=render(OrganOverview,{...props,organ:sparse,facts:[],factCount:0,moreFacts:[],moreFactCount:0});
  const visible=visibleSummary(html);
  assert.match(visible,/Read the source specifications/);
  assert.match(visible,/Explore documented activities/);
  assert.match(visible,/Follow the source records supporting this page/);
  assert.doesNotMatch(visible,/0 stops|0 source|14 collections|No dated activities|No history/);
  assert.match(html,/Full instrument and source context/);
});

test("qualified aggregate wording stays literal and never becomes a selected maximum", () => {
  const qualified={...organ,publicProfile:{sections:[{key:"overview",items:[{label:"Source-reported stops",value:"Sources differ: 41 and 44; no single total",source:"Two retained accounts"}]}]}};
  const html=render(OrganOverview,{...props,organ:qualified});
  assert.match(visibleSummary(html),/Sources differ: 41 and 44; no single total/);
  assert.doesNotMatch(visibleSummary(html),/class="overview-stop-total"/);
  assert.match(html,/2 compared facts · 1 fact differs between sources/);
});

test("complete secondary evidence stays inside native closed disclosures while differences remain signposted", () => {
  const html=render(OrganOverview,props);
  assert.ok(html.indexOf("Essential fact evidence")<html.indexOf('class="overview-details"'));
  for(const content of ["Additional fact evidence","Complete attributed narrative","Complete conflicting source values","All account totals and source links"]) {
    assert.ok(html.indexOf(content)>html.indexOf('class="overview-details"'),content);
  }
  assert.equal((html.match(/<details class="overview-disclosure/g)||[]).length,4);
  assert.doesNotMatch(html,/<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(html,/<summary><span>Compare source assertions<small>2 compared facts · 1 fact differs between sources/);
});

test("a long source list previews only three links and preserves the route to every source", () => {
  const sources=Array.from({length:7},(_,index)=>({id:"s"+index,source:"src:Source "+index,url:"https://example.org/source/"+index}));
  const html=render(OrganOverview,{...props,organ:{...organ,sources}});
  const visible=visibleSummary(html);
  assert.equal((visible.match(/https:\/\/example.org\/source\//g)||[]).length,3);
  assert.match(visible,/Showing 3 source links; the complete list is available below/);
  assert.match(visible,/href="\/organs\/EXAMPLE\?tab=identifiers"/);
  assert.match(html,/All account totals and source links/);
});

test("zero event assertions are shown only when supplied, without reinterpreting dates as present condition", () => {
  const value={...organ,documentedStateSummary:{assertionCount:0,yearLabel:null},sourceSummary:{sourceRecords:null,collections:null}};
  const html=visibleSummary(render(OrganOverview,{...props,organ:value}));
  assert.match(html,/0 source event assertions/);
  assert.match(html,/Follow the source records/);
  assert.doesNotMatch(html,/No dated activities|No history|0 source records|present-day/);
});

test("primary links preserve normal tab actions and modified browser navigation", () => {
  const PureOverview=compile(source,{},{"react":{...React,useId:()=>"test"}, "./sourceComparisonPresentation": comparisonHelpers}).exports.OrganOverview;
  const selected=[];
  const tree=PureOverview({...props,onOpenTab:tab=>selected.push(tab)});
  const nodes=[];
  function visit(node) {
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(!React.isValidElement(node))return;
    if(node.type==="a")nodes.push(node);
    visit(node.props.children);
  }
  visit(tree);
  const link=nodes.find(node=>node.props.href==="/organs/EXAMPLE?tab=specification");
  assert.ok(link);
  let prevented=0;
  link.props.onClick({button:0,preventDefault(){prevented++;}});
  assert.deepEqual(selected,["specification"]);assert.equal(prevented,1);
  for(const event of [{button:1},{button:0,metaKey:true},{button:0,ctrlKey:true},{button:0,shiftKey:true},{button:0,altKey:true}]) {
    link.props.onClick({...event,preventDefault(){prevented++;}});
  }
  assert.deepEqual(selected,["specification"]);assert.equal(prevented,1);
});

const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
const overviewSource=app.slice(app.indexOf("function OverviewTab("),app.indexOf("function FactReviewModal("));
const integration=compile(overviewSource,{
  useState:React.useState,useMemo:React.useMemo,useEffect:React.useEffect,PUBLIC_OVERVIEW_FACT_LIMIT:6,
  OrganOverview,OrganLanding:()=>React.createElement("p",null,"Existing complete landing retained"),
  OrganNarrativeEvidence:()=>React.createElement("p",null,"Existing complete narrative retained"),
  SourceComparisonDisclosure:()=>React.createElement("p",null,"Existing complete comparisons retained"),
  TechnicalSourceComparisons:()=>React.createElement("p",null,"Technical field comparisons retained"),
  PublicFactCard:({fact})=>React.createElement("article",{"data-fact":fact.key},fact.label),
  FactRow:({fact})=>React.createElement("article",{"data-staff-fact":fact.key},fact.label),
  OrganPublicProfileSections:({mode})=>React.createElement("p",null,"Existing staff profile ",mode),
});
const full={...organ,quickFacts:Array.from({length:8},(_,index)=>({key:"f"+index,label:"Fact "+index,normalizerEvidence:[]}))};
const integrationProps={actorId:"",organ:full,onActorIdChange:()=>{},onOrganRefresh:async()=>{},onOpenTab:()=>{},staffMode:false};

test("OverviewTab retains every fact and original evidence component in the public layout", () => {
  const html=render(integration.OverviewTab,integrationProps);
  assert.equal((visibleSummary(html).match(/data-fact=/g)||[]).length,6);
  assert.equal((html.match(/data-fact=/g)||[]).length,8);
  for(const marker of ["Existing complete landing retained","Existing complete narrative retained","Existing complete comparisons retained"])assert.match(html,new RegExp(marker));
});

test("staff Overview keeps the original full fact review and profile route", () => {
  const html=render(integration.OverviewTab,{...integrationProps,staffMode:true});
  assert.equal((html.match(/data-staff-fact=/g)||[]).length,8);
  assert.match(html,/Existing staff profile primary/);
  assert.match(html,/Existing staff profile disclosure/);
  assert.match(html,/Existing complete narrative retained/);
  assert.match(html,/Existing complete comparisons retained/);
  assert.doesNotMatch(html,/class="organ-overview"/);
});

test("overview flags related action scope review before its evidence disclosure opens", () => {
  const technicalGroups = [
    {family: "action_system", status: "single_source", assertions: [{sourceRecordId: "french", displayValue: "Transmission mécanique"}]},
    {family: "key_action", status: "single_source", assertions: [{sourceRecordId: "orgbase", displayValue: "Electrical"}]},
  ];
  const html = render(OrganOverview, {...props, organ: {...organ, sourceComparisons: [], technicalEvidence: {comparisonGroups: technicalGroups}}});
  assert.match(html, /overview-disclosure-differences/);
  assert.match(html, /Action descriptions need comparison<\/small>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|\s|>)/);
});
