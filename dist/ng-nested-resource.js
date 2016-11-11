'use strict';

angular.module('ngNestedResource', [
    'ngResource'
]);
angular.module('ngNestedResource')
    .factory('BaseCollection', ["$filter", function ($filter) {
        var BaseCollection = function (model, perPage, pageNumber) {
            this.model = model;
            this.queryParams = {};
            this.page = pageNumber ? pageNumber : 1;
            this.perPage = perPage ? perPage : 20;
            this.totalItems = 0;
            this.totalPages = 0;
            this.pages = [];
            this.endReached = false;
            this.loading = false;
        };
        BaseCollection.prototype = [];

        BaseCollection.prototype.populate = function (data) {
            var collection = this;
            collection.clear();

            data.forEach(function (obj) {
                collection.push(new collection.model(obj));
            });

            return collection;
        };

        BaseCollection.prototype.loadMore = function (take, success, error) {
            if (this.allLoaded()) {
                // no need to generate another request in this  case
                return this;
            }

            var collection = this;

            this.queryParams.take = take ? take : this.perPage;
            this.queryParams.skip = this.length;

            collection.loading = true;
            return this.model.list(this.queryParams, success, error).then(function (results) {
                if (results.length < collection.queryParams.take) {
                    collection.endReached = true;
                }
                collection.setPagination(results.headers);
                angular.forEach(results, function (item) {
                    collection.push(item);
                });

                collection.loading = false;
                return collection;
            });
        };

        BaseCollection.prototype.query = function (params, success, error) {
            var collection = this;
            collection.queryParams = params ? params : {};

            collection.queryParams.skip = 0;
            if (!collection.queryParams.take) {
                collection.queryParams.take = collection.perPage;
            }

            collection.loading = true;
            return this.model.list(collection.queryParams, success, error).then(function (results) {
                collection.clear();
                collection.setPagination(results.headers);
                angular.forEach(results, function (item) {
                    collection.push(item);
                });

                collection.loading = false;
                return collection;
            });
        };

        BaseCollection.prototype.filter = function (params, success, error) {
            var collection = this;

            collection.queryParams.skip = 0;
            if (!collection.queryParams.take) {
                collection.queryParams.take = collection.perPage;
            }

            collection.loading = true;
            angular.extend(collection.queryParams, params);

            return this.model.list(collection.queryParams, success, error)
                .then(function (results) {
                    collection.clear();
                    collection.setPagination(results.headers);
                    angular.forEach(results, function (item) {
                        collection.push(item);
                    });

                    collection.loading = false;
                    return collection;
                });
        };

        BaseCollection.prototype.clear = function () {
            while (this.length > 0) {
                this.pop();
            }

            this.endReached = false;
        };

        BaseCollection.prototype.allLoaded = function () {
            return angular.isUndefined(this.queryParams.take) || this.queryParams.take > this.length || this.endReached;
        };

        // pagination methods
        BaseCollection.prototype.count = function (success, error) {
            var collection = this;

            return this.model.count(this.queryParams, function (count, headers) {
                collection.setPagination(undefined, count);
                success(count, headers);
                return count;
            }, error);
        };

        BaseCollection.prototype.setPagination = function (headers, count) {
            var collection = this;

            if (angular.isUndefined(headers) && angular.isUndefined(count)) {
                return 0;
            }

            collection.totalItems = count || headers('x-total-count') || collection.totalItems;
            collection.totalPages = (collection.totalItems >= collection.perPage) ? parseInt(collection.totalItems / collection.perPage) : 1;

            collection.pages = [];
            for (var i = 1; i <= collection.totalPages; i++) {
                collection.pages.push({
                    number: i,
                    text: i
                });
            }

        };

        BaseCollection.prototype.selectPage = function (page, params, success, error) {
            if (page > this.totalPages || page < 1) {
                return;
            }

            if (params) {
                this.queryParams = params;
            }

            var collection = this;

            this.queryParams.take = this.perPage;
            this.queryParams.skip = (page - 1) * this.perPage;
            this.page = page;

            collection.loading = true;
            return this.model.list(this.queryParams, success, error).then(function (results) {
                collection.clear();
                angular.forEach(results, function (item) {
                    collection.push(item);
                });

                
                return collection;
            });

        };

        BaseCollection.prototype.noPrevious = function () {
            return this.page === 1;
        };

        BaseCollection.prototype.noNext = function () {
            return this.page === this.totalPages;
        };

        /**
         * Searching for model in collection.
         * @param value
         * @param type
         * @returns BaseModel | null
         */
        BaseCollection.prototype.findByType = function (value, type) {
            type = type || 'id';

            for (var i = 0; i < this.length; i++) {
                if (this[i][type] == value ) {
                    return this[i];
                }
            }

            return null;
        };

        BaseCollection.prototype.remove = function (model) {
            var index = -1;

            angular.forEach(this, function (item, k) {
                if (index == -1 && item.id == model.id) {
                    index = k;
                }
            });

            if (index > -1) {
                this.splice(index, 1);
            }

            model.destroy();
        };

        return function (model) {
            var Collection = function (perPage, pageNumber) {
                return new BaseCollection(model, perPage, pageNumber);
            };
            Collection.prototype = BaseCollection.prototype;
            Collection.model = model;

            return Collection;
        };
    }]);

angular.module('ngNestedResource')
    .factory('BaseModel', ["$resource", "$injector", "$http", function ($resource, $injector, $http) {
        return function (url, urlMap, subModels, resourceMethods) {
            resourceMethods = resourceMethods || {};
            var resource = $resource(
                url,
                urlMap,
                angular.extend({
                    '_list': {
                        method: 'GET',
                        isArray: true
                    },
                    '_store': {method: 'POST'},
                    '_update': {method: 'PUT'},
                    '_destroy': {method: 'DELETE'}
                }, resourceMethods)
            );

            var _parseSubModels = function (instance) {
                angular.forEach(subModels, function (mdClass, field) {
                    if (!angular.isUndefined(instance[field])) {
                        var subModel = $injector.get(mdClass);

                        if (angular.isArray(instance[field])) {
                            if (typeof subModel.model !== 'undefined') {
                                instance[field] = (new subModel()).populate(instance[field]);
                            } else {
                                angular.forEach(instance[field], function (item, key) {
                                    instance[field][key] = new subModel(item);
                                });
                            }
                        } else {
                            instance[field] = new subModel(instance[field]);
                        }
                    }
                });

                return instance;
            };

            resource.prototype.store = function (success, error) {
                return this.$_store({}, success, error).then(function (result) {
                    return _parseSubModels(result);
                });
            };

            resource.prototype.update = function (success, error) {
                return this.$_update({}, success, error).then(function (result) {
                    return _parseSubModels(result);
                });
            };

            resource.prototype.save = function (success, error) {
                if (this.id) {
                    return this.update(success, error);
                } else {
                    return this.store(success, error);
                }
            };

            resource.prototype.delete = function (success, error) {
                return this.$_destroy({}, success, error).then(function (result) {
                    return _parseSubModels(result);
                });
            };

            resource.prototype.destroy = function (success, error) {
                return this.$_destroy({}, success, error);
            };

            resource.prototype.clone = function () {
                var instance = new resource(angular.copy(this));
                return _parseSubModels(instance);
            };

            resource.prototype.isStored = function () {
                return !angular.isUndefined(this.id);
            };

            var Model = function (data) {
                this.instance = new resource(data);
                return _parseSubModels(this.instance);
            };

            Model.list = function (params, success, error) {
                return resource._list(params, null, function (data, headers) {
                    data.headers = headers;
                    if (success) {
                        success(data, headers);
                    }
                }, error)
                    .$promise.then(function (results) {
                        angular.forEach(results, function (item, k) {
                            results[k] = _parseSubModels(item);
                        });

                        return results;
                    });
            };

            Model.get = function (params, success, error) {
                return resource.get(params, null, success, error)
                    .$promise.then(function (result) {
                        return _parseSubModels(result);
                    });
            };

            Model.count = function (params, success, error) {
                return $http({
                    url: url.replace(':id', '') + 'count',
                    method: "GET",
                    params: params
                }).success(success).error(error);
            };

            Model.prototype = resource.prototype;
            Model.parseSubModels = _parseSubModels;
            Model.resource = resource;

            return Model;
        };
    }]);
