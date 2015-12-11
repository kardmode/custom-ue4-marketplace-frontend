// API for interfacing with Epic's 'deep' API

var epic_api = function () {};

global.marketplace = {};
global.marketplace_ajax = {};

global.epic_oauth = (global.epic_oauth === undefined) ? undefined : global.epic_oauth;

global.fakeJar = (global.fakeJar === undefined) ? {} : global.fakeJar;
global.epic_Cookie = (global.epic_Cookie === undefined) ? undefined : global.epic_Cookie;
global.epic_Country = (global.epic_Country === undefined) ? undefined : global.epic_Country;
global.epic_SSO = (global.epic_SSO === undefined) ? undefined : global.epic_SSO;
global.epic_SSO_RM = (global.epic_SSO_RM === undefined) ? undefined : global.epic_SSO_RM;

// Grabs Epic's web login form
// Callback has string parameter containing login form html, i.e. function (form) ()
epic_api.prototype.GetWebLoginForm = function (cb_form) {
	var opts = {
		uri: 'https://accounts.unrealengine.com/login/doLogin',
	};
	
	request.get(opts, function (error, response, body) {
		global.epic_api.updateFakeJar(response.headers['set-cookie']);
		if (cb_form != undefined) {
			cb_form(body);
		}
	});
}

epic_api.prototype.updateFakeJar = function(set_cookie_array) {
	for (var i = 0; i < set_cookie_array.length; ++i) {
		var cookie_pair = set_cookie_array[i].split(';',1)[0].split('=');
		global.fakeJar[cookie_pair[0]] = cookie_pair[1];
		if(cookie_pair[1] == 'invalid') {
			delete global.fakeJar[cookie_pair[0]];
		}
	}
}

epic_api.prototype.GetWebCookieString = function () {
	var cookieString = "";
	for(var key in global.fakeJar) {
    	cookieString += key + '=' + global.fakeJar[key] + '; ';
	}
	return cookieString;
}

epic_api.prototype.WebLogin = function(user, pass, cb_status) {
	var opts = {
		uri: 'https://accounts.unrealengine.com/login/doLogin',
		form:$('form#loginForm').serializeObject(),
		headers: { Cookie: global.epic_api.GetWebCookieString(), 'Origin': 'allar_alternative_marketplace' },
		qs: { client_id: '43e2dea89b054198a703f6199bee6d5b' }
	};
	
	request.post(opts, function(error, response, body) {
		global.epic_api.updateFakeJar(response.headers['set-cookie']);
	
		if (response.statusCode == 400) // login failure
		{
			console.log(response);
		} else if (response.statusCode == 302) // success
		{
			if (cb_status != undefined) {
				cb_status('Authorizing Web Login...', false);
			}
			global.epic_api.WebAuthorize(user, pass, cb_status);
		}
		else {
			console.log(response.statusCode);
		}
		
	});
}

epic_api.prototype.WebAuthorize = function (user, pass, cb_status) {	
	var opts = {
		uri: 'https://accounts.unrealengine.com/authorize/index',
		headers: { Cookie: global.epic_api.GetWebCookieString(), 'Origin': 'allar_alternative_marketplace' },
		qs: { client_id: '43e2dea89b054198a703f6199bee6d5b', response_type: 'code', forWidget: 'true' }
	};
	
	request.get(opts, function(error, response, body) {
		global.epic_api.updateFakeJar(response.headers['set-cookie']);
		
		if (response.statusCode == 200 && response.headers['access-control-expose-headers'] == 'X-EPIC-LOGIN-COMPLETE-REDIRECT') {
			var json = JSON.parse(body);
			var code = json.redirectURL.split('?code=')[1];
			if (cb_status != undefined) {
				cb_status('Successfully Web Authorized! Performing Web Exchange...', false);
			}
			global.epic_api.WebExchange(user, pass, code, cb_status);
		} else {
			if (cb_status != undefined) {
				cb_status('Web Auth failed: ' + JSON.stringify(response, null, ' '));
			}
		}
	});
}

epic_api.prototype.WebExchange = function (user, pass, code, cb_status) {
	var opts = {
		uri: 'https://www.unrealengine.com/exchange',
		headers: { Cookie: global.epic_api.GetWebCookieString() },
		qs: { code: code }
	};
	
	request.get(opts, function(error, response, body) {
		global.epic_api.updateFakeJar(response.headers['set-cookie']);
		
		if (response.statusCode == 302) {
			if (cb_status != undefined) {
				cb_status('Intentionally failed Web Exchage! Performing OAuth...', false);
			}
			global.epic_api.OAuthViaPassword(user, pass, cb_status);
		} else {
			if (cb_status != undefined) {
				cb_status('Web Exchange failed: ' + JSON.stringify(response, null, ' '));
			}
		}
	});
}

// Go through Epic's OAuth chain using a username and password
// cb_status is a callback with string parameter of current OAuth status and bool of whether complete. (status, bComplete)
epic_api.prototype.OAuthViaPassword = function (user, pass, cb_status) {	
	var opts = {
		uri: 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token',
		headers: { Authorization: 'basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=' },
		form: { grant_type: 'password', username: user, password: pass, includePerms: true }
	};
	
	request.post(opts, function(error, response, body) {
		if (response.statusCode == 200) {
			global.epic_oauth = JSON.parse(body);
			if (cb_status != undefined) {
				cb_status('Got OAuth token, exchanging for code', false);	
			}
			module.exports.OAuthExchange(cb_status);
		} else {
			if (cb_status != undefined) {
				cb_status('OAuth Via Password failed: ' + JSON.stringify(response, null, ' '));
			}
		}
	});
}

// cb_status is a callback with string parameter of current OAuth status and bool of whether complete. (status, bComplete)
epic_api.prototype.OAuthExchange = function(cb_status) {
	var opts = {
		uri: 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/exchange',
		headers: { Authorization: 'bearer ' +  global.epic_oauth.access_token }
	};
	
	request.get(opts, function(error, response, body) {
		if (response.statusCode == 200) {
			var json = JSON.parse(body);
			global.epic_oauth.code = json.code;
			if (cb_status != undefined) {
				if (global.epic_SSO === undefined)
				{
					cb_status('Got OAuth exchange code. Getting SSO.', false);
				}
				else
				{
					cb_status('Got OAuth exchange code. Skipping SSO.', true);
				}
			}
			// Grab our SSO token
			if (global.epic_SSO === undefined) {
				cb_status('Successfully Authorized!', true);
				global.epic_api.GetSSOWithOAuthCode(cb_status);
			}
			// renew our token before it expires
			global.setTimeout(module.exports.OAuthExchange, 250 * 1000);
		} else {
			if (cb_status != undefined) {
				cb_status('OAuth renew failed: ' + JSON.stringify(response, null, ' '), false);
			}
		}
	});
}

// cb_status is a callback with string parameter of current OAuth status and bool of whether complete. (status, bComplete)
epic_api.prototype.GetSSOWithOAuthCode = function(cb_status) {
	var opts = {
		uri: 'https://accountportal-website-prod07.ol.epicgames.com/exchange?',
		headers: { Authorization: 'bearer ' +  global.epic_oauth.access_token },
		qs: { exchangeCode: global.epic_oauth.code, state: '/getSsoStatus' }
	};

	request.get(opts, function(error, response, body) {
		//module.exports.updateFakeJar(response.headers['set-cookie']);
		
		if (response.statusCode == 302) {
			if (cb_status != undefined) {
				cb_status('Successfully Authorized!', true);
			}
		} else {
			if (cb_status != undefined) {
				cb_status('Failed SSO: ' + JSON.stringify(response, null, ' '), true);
			}
		}
	});
}

// Gets 'user-friendly' marketplace categories
// namespace 'ue': Marketplace items
// callback expects a bool indicating whether we fetched data, i.e. (success)
epic_api.prototype.GetMarketplaceCategories = function (cb) {	
	var opts = {
		uri: 'https://www.unrealengine.com/assets/ajax-get-categories',
		form: {category: 'assets/environments', start: 0},
	};
	
	request.post(opts, function(error, response, body) {
		if (response.statusCode == 200) {
			global.marketplace_categories = JSON.parse(body).categories;
			if (cb != undefined) {
				cb(true);
			}
		} else {
			if (cb != undefined) {
				cb(false);
			}
		}
	});
}

// Used for Catalog data path, currently irrelevant as Catalog data doesn't offer ratings
// Get Category index by path
epic_api.prototype.GetCategoryIndex = function (category_path) {
	// Due to outdated Epic data, we have to fix up some paths
	switch (category_path) {
		case 'assets/fx':
		case 'assets/textures':
			category_path = 'assets/textures-fx';
			break;
		case 'assets/weapons':
		case 'assets/props':
			category_path = 'assets/weapons-props';
			break;
		case 'assets/soundfx':
		case 'assets/music':
			category_path = 'assets/music-soundfx';
			break;
		case 'assets/animations':
		case 'assets/characters':
			category_path = 'assets/characters-animations';
			break;
		case 'assets':
			return -1;
	}
	for (var i = 0; i < global.marketplace_categories.length; ++i) {
		if (global.marketplace_categories[i].path == category_path) {
			return i;
		}
	}
	console.warn("Couldn't find category index for " + category_path);
	return -1;
}

// UNUSED: Epic's catalog API doesn't give us ratings information
// Gets Catalog offers for the provided namespace
// namespace 'ue': Marketplace items
// callback expects a bool indicating whether we fetched data, i.e. (success)
epic_api.prototype.CatalogItems = function (namespace, cb) {
	if (global.epic_oauth === undefined) {
		if (cb != undefined) {
			cb(false);
		}
		return;
	}
	var opts = {
		uri: 'https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/' + namespace + '/offers',
		headers: { Authorization: 'bearer ' + global.epic_oauth.access_token },
		qs: { status: 'SUNSET|ACTIVE', country: 'US', locale: 'en', start: 0, count: 1000, returnItemDetails: true }
	};
	
	request.get(opts, function(error, response, body) {
		if (response.statusCode == 200) {
			global.marketplace = JSON.parse(body);
			if (cb != undefined) {
				cb(true);
			}
		} else {
			if (cb != undefined) {
				cb(false);
			}
		}
	});
}

// Due to Epic's catalog API not offering ratings, we might as well use the
// web API to grab everything as that does have all the data we'll ever need
// Also lists all available categories
// Takes function 'cb' with signature (json, path, finished)
// json: The json object Epic returned for that single fetch
// path: The category path that was fetched
// finished: bool whether that category is finished fetching
epic_api.prototype.getAssetsInCategory = function(category, start, addToTable, cb) {
	var opts = {
		uri: 'https://www.unrealengine.com/assets/ajax-get-categories',
		form: {category: category, start: start},
		headers: { Cookie: global.epic_api.GetWebCookieString() },
	};	
	request.post(opts, function(error, response, body) {
		
		if (response.statusCode == 200) {
			var json = JSON.parse(body);
			var finished = false;
			if (addToTable == true) {
				
				// Add category definition if it doesn't exist (it should though)
				if (global.marketplace_ajax[json.categoryPath] === undefined) {
					global.marketplace_ajax[json.categoryPath] = { name: json.category.name };
				}
				
				// Add first set of assets to this category definition
				if (global.marketplace_ajax[json.categoryPath].assets === undefined) {
					global.marketplace_ajax[json.categoryPath].assets = json.assets;
				} else { // Add assets to category definition
					json.assets.forEach(function(v) {global.marketplace_ajax[json.categoryPath].assets.push(v);});
				}
				
				// If this is the first grab for assets of this category, kick off grabbing the rest
				if (start == 0) {
					global.marketplace_ajax[json.categoryPath].assetCount = json.assetCount;
					for (var i = 0; i < Math.floor((json.assetCount-1) / json.assetPerPage); ++i) {
						module.exports.getAssetsInCategory(json.categoryPath, (i+1)*json.assetPerPage, true, function (nextjson, nextpath, nextfinished) {
							cb(nextjson, nextpath, nextfinished);
						});	
					}
				}
				
				if (global.marketplace_ajax[json.categoryPath].assets.length == global.marketplace_ajax[json.categoryPath].assetCount) {
					console.log("Done getting assets for category: " + json.categoryPath);
					finished = true;
				}
			}
			cb(json, json.categoryPath, finished);
		} else {
			console.error(response);
		}
	});
}

epic_api.prototype.getAllMarketplaceAssets = function(cb_done) {
	global.fetching = true;

	var categoriesLeft = global.marketplace_categories.length;
			
	// Build Category List
	for (var i = 0; i < global.marketplace_categories.length; ++i) {
		global.marketplace_ajax[global.marketplace_categories[i].path] = { name: global.marketplace_categories[i].name };
		module.exports.getAssetsInCategory(global.marketplace_categories[i].path, 0, true, function (json, path, finished) { 
			if(finished) {
				categoriesLeft--;
				if (categoriesLeft == 0) {
					global.fetching = false;
					if (cb_done != undefined) {
						cb_done();
					}
				}
			}
		});
	}		

}

// Hash Functions

global.HexChars = ["0", "1", "2", "3", "4", "5", "6", "7","8", "9", "A", "B", "C", "D", "E", "F"];

epic_api.prototype.ByteToHex = function (b) {
  return global.HexChars[(b >> 4) & 0x0f] + global.HexChars[b & 0x0f];
}

// Takes hash of 24-character decimal form (8 * 3char) and outputs 16-character hex in reverse byte order
epic_api.prototype.ChunkHashToReverseHexEncoding = function (chunk_hash) {
	var out_hex = '';
	
	for (var i = 0; i < 8; ++i) {
		out_hex = module.exports.ByteToHex(parseInt(chunk_hash.substring(i*3, i*3+3))) + out_hex;
	}
	
	return out_hex;
}

module.exports = new epic_api();