exports.handler = async function(event, context)  {
    return new Promise(async (resolve, reject) => {
        console.log("Received event {}", JSON.stringify(event, 3));
        const products = {
            "1": {
                "Id": "1",
                "Name": "First product",
                "Description": "My sample product",
                "Price": 36.99,
                "Weight": 1.5,
                "SupplierId": 1,
                "CategoryId": 1
            },
            "2": {
                "Id": "2",
                "Name": "Second product",
                "Description": "My sample product",
                "Price": 26.99,
                "Weight": 2.5,
                "SupplierId": 1,
                "CategoryId": 1
            },
            "3": {
                "Id": "3",
                "Name": "Third product",
                "Description": "My sample product",
                "Price": 44.99,
                "Weight": 4,
                "SupplierId": 1,
                "CategoryId": 2
            },
        }

        console.log("Got an Invoke Request.", event);
        switch(event.field) {
            case "getProduct":
                const id = event.arguments.Id;
                resolve(products[id]);
                break;
            case "getProducts":
                const values = [];
                for(const d in products){
                    if (products[d].CategoryId === event.arguments.CategoryId) {
                        values.push(products[d]);
                    }
                }
                resolve(values);
                break;
            default:
                resolve("Unknown field, unable to resolve" + event.field, null);
                break;
        }
    });
};