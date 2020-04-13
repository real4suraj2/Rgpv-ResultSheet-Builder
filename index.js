const request = require('request');
const fs = require('fs');
const http = require('http');
const express = require('express');
const bodyParser = require("body-parser");
const Tesseract = require('tesseract.js');
const worker = new Tesseract.TesseractWorker();
var cheerio = require('cheerio');
const socketIO = require('socket.io');

const app = express();
const port=process.env.PORT || 3000;
const hbs=require('hbs');
var io = socketIO(server);


var server = http.createServer(app);
var io = socketIO(server);
var set = [];
var permit = true;
app.use(express.static(__dirname+'/public'));
//app.use(express.static(__dirname+''));

app.set('view-engine','hbs');
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());
app.get('/',(req,res)=>{
res.render("index.hbs");
});
io.on('connection', (socket) => {
  console.log('New user connected');
  permit = false;
  io.emit("getTotal",set.length);
  io.emit("getSet",set);
	socket.on("getResult",function(rollNos){
  console.log("-------AutoFetch----------- ",rollNos.length);
  rollNos.forEach((rollNo,i)=>{
	  var time = i==0? 4000 : 3000;
	  result({rollNo,semester},time).then((data)=>{
					data.result = (data.result).split(',').join(' ');
			   var dataCSV= rollNo+','+data.name+','+data.course+','+data.sgpa+','+data.cgpa+','+result+'\n';
				io.emit("newEntry",data);
			   //save(dataCSV);
				}).catch(()=>{
				io.emit("newEntry",{
				rollNo:rollNo,
				name:'NA',
				course:'NA',
				sgpa:'NA',
				cgpa:'NA',
				result:'NA'
			});
				});
	  })	
		})
  socket.on("singleFetch",function({rollNo}){
  console.log("-------singleFetch----------- "+ rollNo);
 result({rollNo,semester},4000).then((data)=>{
					console.log("Through singleFetch!!");
					data.result = (data.result).split(',').join(' ');
			   var dataCSV= rollNo+','+data.name+','+data.course+','+data.sgpa+','+data.cgpa+','+result+'\n';
				io.emit("refreshEntry",data);
			   //save(dataCSV);
				}).catch(()=>{
				io.emit("refreshEntry",{
				rollNo:rollNo,
				name:'NA',
				course:'NA',
				sgpa:'NA',
				cgpa:'NA',
				result:'NA'
			});
				});
	
})
  socket.on('disconnect', () => {
    console.log('User was disconnected');
	permit = true;
	process.exit(0);
  });
});
var resultSheet = [];
var vs = '';
var vg = '';
var ev = '';
var semester;
function setup(){
	return new Promise((resolve,reject)=>{
		request('http://result.rgpv.ac.in/result/programselect.aspx?id=%24%25',(err,res,body)=>{
			 var $ = cheerio.load(body);
			 vs = encodeURIComponent($("input[id='__VIEWSTATE']").val());
			 vg = encodeURIComponent($("input[id='__VIEWSTATEGENERATOR']").val());
			 ev = encodeURIComponent($("input[id='__EVENTVALIDATION']").val());
			if(vs.length>0)
				resolve();
			reject();
		})
	})
}



function fetch() {
	return new Promise((resolve,reject)=>{ request({
		url: 'https://rgpv-result-97f7d.firebaseio.com/results.json', method: "GET"
	}, (err, res, body) => {
		resolve(JSON.parse(body));
		//console.log("Data fetched");
	})
	})
}
function pausecomp(millis) {
	var date = new Date();
	var curDate = null;
	do { curDate = new Date(); }
	while (curDate - date < millis);
}
function ocr(img) {
	return new Promise((resolve, reject) => {
		worker.recognize(img)
			.catch(err => reject(err))
			.then(result => {

				var text = result.text.replace(/[^a-zA-Z0-9]/g, "");
				text = text.slice(0, text.length);
				text = text.toUpperCase();
				console.log(text);
				if (text.length != 5)
					reject();
				resolve(text);
			})
	})
}

function saveData(data){
	var r =data['rollNo'];
	var obj = {};
	obj[r] = data;
	return new Promise((resolve,reject)=>{
		request({
	url:'https://rgpv-result-97f7d.firebaseio.com/results.json',method:"PATCH",body:JSON.stringify(obj)
},(err,res,body)=>{
	console.log(data.rollNo+" added");
	resolve();
})
	})
	
}
var cookie = request.jar();
function result({rollNo,semester},timer) {
	return new Promise((resolve, reject) => {
		
		request({
			url:
`http://result.rgpv.ac.in/result/programselect.aspx?id=%24%25&__EVENTTARGET=radlstProgram%241&__EVENTARGUMENT=&__LASTFOCUS=&__VIEWSTATE=${vs}&__VIEWSTATEGENERATOR=${vg}&__EVENTVALIDATION=${ev}&radlstProgram=24`,
			method: "GET",
			jar: cookie
		}, (err, response, body) => {
			if(err)
				reject();
			try{
			var $ = cheerio.load(body);
			var rejection = $('h1');
			var viewState = $("input[id='__VIEWSTATE']").val();
			var viewStateGenerator = $("input[id='__VIEWSTATEGENERATOR']").val();
			var eventValidation = $("input[id='__EVENTVALIDATION']").val();
			var image = $("img");
			var img = 'http://result.rgpv.ac.in/result/' + String(image['1'].attribs.src);
			var login = '';
			ocr(img).then((captcha) => {
				login = {
					'__EVENTTARGET': '',
					'__EVENTARGUMENT': '',
					'__VIEWSTATE': viewState,
					'__VIEWSTATEGENERATOR': viewStateGenerator,
					'__EVENTVALIDATION': eventValidation,
					'ctl00$ContentPlaceHolder1$txtrollno': rollNo,
					'ctl00$ContentPlaceHolder1$drpSemester': String(semester),
					'ctl00$ContentPlaceHolder1$rbtnlstSType': 'G',
					'ctl00$ContentPlaceHolder1$TextBox1': captcha,
					'ctl00$ContentPlaceHolder1$btnviewresult': 'View Result'
				};
				pausecomp(timer);
				request({
					url: `http://result.rgpv.ac.in/result/BErslt.aspx`,
					jar: cookie, method: "POST", form: login
				}, (error, response, body) => {
					if(error)
						reject();
					var $ = cheerio.load(body);
					var data = {
						rollNo: rollNo,
						name: $("span[id='ctl00_ContentPlaceHolder1_lblNameGrading']").text().trim(),
						course: $("span[id='ctl00_ContentPlaceHolder1_lblProgramGrading']").text(),
						sgpa: $("span[id='ctl00_ContentPlaceHolder1_lblSGPA']").text(),
						cgpa: $("span[id='ctl00_ContentPlaceHolder1_lblcgpa']").text(),
						result: $("span[id='ctl00_ContentPlaceHolder1_lblResultNewGrading']").text()
					}
					let nextSub = 1,nextGrade = 4,currentSub = '';
					let f = $('td').slice(22,63).each(function(i,elem){
							if(i == nextSub){
								currentSub = $(this).text();
								nextSub += 4;
								}
							else if(i == nextGrade){
								data[currentSub] = $(this).text();
								nextGrade += 4; 
								}
						});
					if (data.name.length > 1) {
						//console.log(data);
						resolve(data);
					}
					reject();
				})
			}).catch(e => reject());
			}catch{
				reject();
			}
		})
	});
}

app.use('/data',(req,res,next)=>{
	var apiKey = req.body.apiKey;
	if(apiKey!=="test"||!permit){
		var error = "NOT Authorized!!!"
		if(!permit)
			error = "API busy ! Please try different API key"
		res.render("index.hbs",{
			error:error
		});
		return;
	}
	setup().then(() => {
	var startingBit = req.body.startingBit;
	var branch = req.body.branch;
	var midBit = req.body.midBit;
	var rollNoS = req.body.rollNoS;
	var rollNoE = req.body.rollNoE;
	semester = req.body.semester;
	var start = startingBit+branch+midBit;
	for(var i = parseInt(rollNoS); i<=parseInt(rollNoE); i++){
		var s = '';
		if(String(i).length!=4){
			while(s.length!=4-String(i).length){
				s+='0';
			}
		}
		s+=String(i);
		var rollNo = start+s;
		set.push(rollNo);
	}
	res.sendFile(__dirname+"/public/data.html");
	})
	
});

function save(data){
	fs.appendFile('test.csv',data,(err)=>{
		if(err)
			console.log("Failed");
	})
}
function singleFetch(rol,semester){ 
 result({rol,semester},4000).then((data)=>{
					console.log("Through singleFetch!!");
					result = (data.result).split(',').join(' ');
			   var dataCSV= rollNo+','+data.name+','+data.course+','+data.sgpa+','+data.cgpa+','+result+'\n';
				save(dataCSV);
				}).catch();
 
}
server.listen(port,()=>{
	console.log(`server running on port ${port} !`);
})
