/*
 * Read a manifest's transcription.
 * author: cubap@slu.edu
 */
var rerum = angular.module('rerum', ['ui.bootstrap', 'ngRoute', 'ngSanitize', 'angular-loading-bar', 'utils']);
rerum.config(['$routeProvider',
    function ($routeProvider) {
        $routeProvider
            .when('/aybee', {
                templateUrl: 'aybee.html',
                controller: 'aybeeController',
                resolve: {
                    obj: function ($location, $http, rerumService) {
                        // TODO: preload a known manifest from the URL or memory
                        var mUrl = $location.search().url;
                        var manifest = (mUrl && $http.get(mUrl)
                            .then(function (m) {
                                // success
                                rerumService.extractResources(m.data);
                                return m.data;
                            }, function (err) {
                                // error
                                return {
                                    error: err
                                };
                            })) || {};
                        return manifest;
                    }
                }
            })
            .otherwise(({ redirectTo: '/aybee' }));
    }]);
rerum.value('config', {
    buffer: .05, // percent of canvas height
    closeCrop: false, // show just enough around a slice to view
    currentSequenceIndex: 0,
    currentCanvasIndex: 0
});
rerum.value('Manifest', {});
rerum.controller('mainController', function ($scope, $location) {

});
rerum.controller('aybeeController', function ($scope, $http, $sce, obj, rerumService) {
    $scope.obj = obj;
    $scope.screen = {
        language: "en",
        murl: "",
        letters: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]
    };
    $scope.annotations = [];
    if (obj['@id']) {
        angular.forEach(obj.sequences[0].canvases, function (canvas) {
            var uri;
            if (!canvas.otherContent) {
                return false;
            }
            if (angular.isArray(canvas.otherContent[0].resources)) {
                $scope.annotations = $scope.annotations.concat(canvas.otherContent[0].resources);
                return false;
            }
            if (typeof canvas.otherContent[0] === "string") {
                uri = canvas.otherContent[0];
            } else if (!canvas.otherContent[0].resources && canvas.otherContent[0]['@id']) {
                uri = canvas.otherContent[0]['@id'];
            }
            rerumService.resolveURI(uri)
                .then(function (res) {
                    canvas.otherContent[0] = res.data;
                    $scope.annotations = $scope.annotations.concat(canvas.otherContent[0].resources);
                }, function (err) { });
        });
    }
    $scope.trust = function (body) {
        if (typeof body === "string")
            return $sce.trustAsHtml(body);
        return $sce.trustAsHtml("")
    };

    $scope.setDescription = function (desc, lang) {
        $scope.screen.language = lang;
        $scope.description = "";
        if (!desc) {
            return $scope.description;
        }
        if (angular.isArray(desc)) {
            $scope.languages = [];
            angular.forEach(desc, function (o, i) {
                $scope.languages.push(o['@language']);
                if (o['@language'] === lang) {
                    $scope.description = o['@value'];
                }
            });
            return $scope.description;
        }
        if (typeof $scope.description === "string") {
            return $scope.description;
        }
        return $scope.description;
    };
    $scope.setDescription(obj.description, "en");
    function checkResponse(data) {
        if (!data || Object.keys(data).length === 0) {
            showError({
                statusText: "The call succeeded but the response was empty.",
                code: 200
            });
        }
    }
    $scope.getValue = function (a) {
        let val
        let res = a.resource || a.body
        if (!res) throw new Error("No annotation body detected")
        if (!angular.isArray(res)) res = [res]
        res.forEach(function (body) {
            if (val) return // breakout after the first found for now
            val = body['cnt:chars']
                || body['chars']
                || body['@value']
                || body.value
        })
        return val
    }

    $scope.alphaSet = function (list) {
        list.sort(function (a, b) {
            let aVal = $scope.getValue(a)
            let bVal = $scope.getValue(b)
            if (aVal < bVal) {
                return -1
            }
            if (aVal > bVal) {
                return 1
            }
            return 0
        });
        return list;
    };
    $scope.searchIndex = function (actual, expected) {
        var lowerStr = (actual + "").toLowerCase();
        return lowerStr.indexOf(expected.toLowerCase());
    }
});